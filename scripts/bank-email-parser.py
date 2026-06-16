import imaplib
import email
import json
import os
import re
import ssl
import sys
import unicodedata
from datetime import datetime, timezone
from email.header import decode_header
from email.policy import default
from email.utils import getaddresses
from html import unescape
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


PROVIDER = "BREB_LLAVES"


def env(name: str, default_value: str | None = None) -> str:
    value = os.environ.get(name, default_value)

    if value is None or str(value).strip() == "":
        raise RuntimeError(f"Falta la variable de entorno {name}")

    value = str(value).strip()

    placeholders = [
        "TU_",
        "AQUI_",
        "CLAVE_REAL",
        "TU-PROYECTO",
        "TU_URL",
        "TU_SERVICE",
    ]

    if any(value.upper().startswith(p) for p in placeholders):
        raise RuntimeError(f"La variable {name} todavía tiene texto de ejemplo: {value}")

    return value


def optional_env(name: str, default_value: str) -> str:
    value = os.environ.get(name)
    if value is None or str(value).strip() == "":
        return default_value
    return str(value).strip()


def decode_mime(value: str | None) -> str:
    if not value:
        return ""

    pieces = []

    for decoded, charset in decode_header(value):
        if isinstance(decoded, bytes):
            pieces.append(decoded.decode(charset or "utf-8", errors="replace"))
        else:
            pieces.append(decoded)

    return "".join(pieces)


def normalize_text(value: str) -> str:
    value = value or ""
    value = unicodedata.normalize("NFKD", value)
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = value.upper()
    value = re.sub(r"[^A-Z0-9]", "", value)
    return value


def normalize_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def parse_amount(value: str) -> int:
    cleaned = value.strip()
    cleaned = cleaned.replace("$", "")
    cleaned = cleaned.replace("COP", "")
    cleaned = cleaned.replace(" ", "")
    cleaned = cleaned.replace(".", "")
    cleaned = cleaned.replace(",", "")

    if not cleaned.isdigit():
        raise ValueError(f"Monto inválido: {value}")

    return int(cleaned)


def extract_text_from_email(message: email.message.EmailMessage) -> str:
    body = ""

    try:
        plain = message.get_body(preferencelist=("plain",))
        if plain is not None:
            body = plain.get_content()
    except Exception:
        body = ""

    if not body:
        try:
            html_body = message.get_body(preferencelist=("html",))
            if html_body is not None:
                html = html_body.get_content()
                html = re.sub(r"(?is)<(script|style).*?>.*?</\1>", " ", html)
                html = re.sub(r"(?s)<[^>]+>", " ", html)
                body = unescape(html)
        except Exception:
            body = ""

    if not body and message.is_multipart():
        parts = []

        for part in message.walk():
            content_type = part.get_content_type()

            if content_type not in ("text/plain", "text/html"):
                continue

            try:
                payload = part.get_payload(decode=True)
                charset = part.get_content_charset() or "utf-8"

                if payload:
                    text = payload.decode(charset, errors="replace")

                    if content_type == "text/html":
                        text = re.sub(r"(?is)<(script|style).*?>.*?</\1>", " ", text)
                        text = re.sub(r"(?s)<[^>]+>", " ", text)
                        text = unescape(text)

                    parts.append(text)
            except Exception:
                continue

        body = "\n".join(parts)

    return normalize_spaces(body)


def parse_breb_nequi_email(subject: str, body: str) -> dict:
    full_text = normalize_spaces(f"{subject} {body}")

    # Formato real visto:
    # "Recibiste 100 de DANNA GABRIELA NAVARRO el 10 de junio de 2026 a las 4:37 p.m, desde el banco Nequi."
    pattern = re.compile(
        r"Recibiste\s+\$?\s*([0-9][0-9\.\,\s]*)\s+de\s+(.+?)\s+el\s+(\d{1,2}\s+de\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+\s+de\s+\d{4})\s+a\s+las\s+([^,\.]+(?:\s*[ap]\.?\s*m\.?)?)",
        re.IGNORECASE,
    )

    match = pattern.search(full_text)

    if not match:
        # Fallback más simple por si cambia un poco el correo.
        fallback = re.search(
            r"Recibiste\s+\$?\s*([0-9][0-9\.\,\s]*)\s+de\s+(.+?)\s+el\s+",
            full_text,
            re.IGNORECASE,
        )

        if not fallback:
            raise ValueError("No pude extraer monto y nombre del remitente del correo Bre-B.")

        amount_text = fallback.group(1)
        payer_name = fallback.group(2)
        date_text = ""
        time_text = ""
    else:
        amount_text = match.group(1)
        payer_name = match.group(2)
        date_text = match.group(3)
        time_text = match.group(4)

    amount = parse_amount(amount_text)
    payer_name = normalize_spaces(payer_name)

    if not payer_name:
        raise ValueError("El nombre del remitente quedó vacío.")

    normalized_payer = normalize_text(payer_name)

    if not normalized_payer:
        raise ValueError("No pude normalizar el nombre del remitente.")

    return {
        "amount": amount,
        "payer_origin": payer_name,
        "normalized_payer_origin": normalized_payer,
        "date_text": date_text,
        "time_text": time_text,
    }


def make_reference(message_id: str, amount: int, normalized_payer: str) -> str:
    base = message_id.strip() if message_id else ""
    base = re.sub(r"[<>\s]", "", base)

    if base:
        clean = re.sub(r"[^A-Za-z0-9_\-\.@]", "", base)
        return f"BREB-{clean[:80]}"

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    return f"BREB-{amount}-{normalized_payer[:30]}-{stamp}"


def get_sender_email(message: email.message.EmailMessage) -> str:
    raw_from = decode_mime(message.get("From", ""))
    parsed = getaddresses([raw_from])

    if parsed and parsed[0][1]:
        return parsed[0][1].lower().strip()

    return raw_from.lower().strip()


def insert_into_supabase(payload: dict) -> bool:
    supabase_url = env("NEXT_PUBLIC_SUPABASE_URL").rstrip("/")
    service_key = env("SUPABASE_SERVICE_ROLE_KEY")

    endpoint = f"{supabase_url}/rest/v1/bank_payment_notifications"

    data = json.dumps(payload).encode("utf-8")

    request = Request(
        endpoint,
        data=data,
        method="POST",
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
    )

    try:
        with urlopen(request, timeout=30) as response:
            body = response.read().decode("utf-8", errors="replace")
            print("Supabase insert OK.")
            if body:
                print(body)
            return True

    except HTTPError as error:
        error_body = error.read().decode("utf-8", errors="replace")

        if error.code == 409 or "duplicate" in error_body.lower() or "23505" in error_body:
            print("El correo ya estaba insertado en Supabase. Se omite duplicado.")
            return True

        print("Error HTTP insertando en Supabase.")
        print("Status:", error.code)
        print(error_body)
        return False

    except URLError as error:
        print("Error de conexión con Supabase:", error)
        return False


def select_mailbox(imap: imaplib.IMAP4_SSL, mailbox: str) -> None:
    print(f"Abriendo carpeta/etiqueta IMAP: {mailbox}")

    attempts = [
        mailbox,
        f'"{mailbox}"',
        mailbox.replace("/", "."),
        f'"{mailbox.replace("/", ".")}"',
    ]

    last_error = None

    for candidate in attempts:
        try:
            status, data = imap.select(candidate, readonly=False)

            if status == "OK":
                print(f"Mailbox OK: {candidate}")
                return

            last_error = data
        except Exception as exc:
            last_error = exc

    print("No pude abrir la etiqueta/carpeta indicada.")
    print("Respuesta:", last_error)
    print("")
    print("Carpetas disponibles en tu Gmail por IMAP:")

    try:
        status, mailboxes = imap.list()
        if status == "OK":
            for item in mailboxes or []:
                try:
                    print(" -", item.decode("utf-8", errors="replace"))
                except Exception:
                    print(" -", item)
    except Exception as exc:
        print("No pude listar carpetas:", exc)

    raise RuntimeError(f"No se pudo abrir el mailbox IMAP: {mailbox}")


def process_message(imap: imaplib.IMAP4_SSL, uid: bytes, allowed_senders: set[str]) -> None:
    uid_text = uid.decode("utf-8", errors="replace")
    print("")
    print("=" * 70)
    print(f"Procesando UID: {uid_text}")

    status, data = imap.uid("fetch", uid, "(BODY.PEEK[])")

    if status != "OK" or not data:
        print("No pude descargar el correo.")
        return

    raw_email = None

    for item in data:
        if isinstance(item, tuple) and len(item) >= 2:
            raw_email = item[1]
            break

    if not raw_email:
        print("El correo vino vacío.")
        return

    message = email.message_from_bytes(raw_email, policy=default)

    subject = decode_mime(message.get("Subject", ""))
    sender = get_sender_email(message)
    message_id = decode_mime(message.get("Message-ID", ""))

    print("De:", sender)
    print("Asunto:", subject)
    print("Message-ID:", message_id or "(sin Message-ID)")

    if allowed_senders and sender not in allowed_senders:
        print("Remitente no permitido. Se omite.")
        return

    if "bre-b" not in subject.lower() and "breb" not in subject.lower():
        print("El asunto no parece ser Bre-B. Se omite.")
        return

    body = extract_text_from_email(message)

    print("Texto detectado:")
    print(body[:700])

    try:
        parsed = parse_breb_nequi_email(subject, body)
    except Exception as exc:
        print("No pude parsear este correo:", exc)
        print("Se deja como no leído para revisar o ajustar el parser.")
        return

    transaction_reference = make_reference(
        message_id=message_id,
        amount=parsed["amount"],
        normalized_payer=parsed["normalized_payer_origin"],
    )

    payload = {
        "provider": PROVIDER,
        "sender_email": sender,
        "subject": subject,
        "message_id": message_id or f"gmail-uid-{uid_text}",
        "transaction_reference": transaction_reference,
        "amount": parsed["amount"],
        "payer_origin": parsed["payer_origin"],
        "normalized_payer_origin": parsed["normalized_payer_origin"],
        "paid_at": datetime.now(timezone.utc).isoformat(),
    }

    print("Pago detectado:")
    print(json.dumps(payload, ensure_ascii=False, indent=2))

    inserted = insert_into_supabase(payload)

    if inserted:
        imap.uid("store", uid, "+FLAGS", r"(\Seen)")
        print("Correo marcado como leído.")
        print(
            f"Insertado {PROVIDER} {parsed['amount']} {parsed['payer_origin']} {transaction_reference}"
        )
    else:
        print("No se marcó como leído porque no se pudo insertar.")


def main() -> int:
    print("Iniciando parser Bre-B / Llaves...")

    imap_host = env("BANK_IMAP_HOST")
    imap_port = int(optional_env("BANK_IMAP_PORT", "993"))
    imap_user = env("BANK_IMAP_USER")
    imap_password = env("BANK_IMAP_PASSWORD")
    mailbox = optional_env("BANK_IMAP_MAILBOX", "INBOX")

    allowed_senders_raw = optional_env("BANK_ALLOWED_SENDERS", "")
    allowed_senders = {
        sender.strip().lower()
        for sender in allowed_senders_raw.split(",")
        if sender.strip()
    }

    print("IMAP host:", imap_host)
    print("IMAP port:", imap_port)
    print("IMAP user:", imap_user)
    print("Mailbox:", mailbox)
    print("Allowed senders:", ", ".join(sorted(allowed_senders)) or "(todos)")

    context = ssl.create_default_context()
    imap = None

    try:
        print("Conectando a IMAP...")
        imap = imaplib.IMAP4_SSL(imap_host, imap_port, ssl_context=context)

        print("Login IMAP...")
        imap.login(imap_user, imap_password)
        print("Login IMAP OK.")

        select_mailbox(imap, mailbox)

        print("Buscando correos no leídos...")
        status, data = imap.uid("search", None, "UNSEEN")

        if status != "OK":
            print("No pude buscar correos no leídos:", data)
            return 1

        uids = data[0].split() if data and data[0] else []

        print(f"Correos no leídos encontrados: {len(uids)}")

        if not uids:
            print("No hay correos no leídos para procesar.")
            return 0

        for uid in uids:
            process_message(imap, uid, allowed_senders)

        print("")
        print("Proceso terminado.")
        return 0

    except imaplib.IMAP4.error as exc:
        print("Error IMAP:", exc)
        print("")
        print("Si dice AUTHENTICATIONFAILED:")
        print("- No uses la contraseña normal de Gmail.")
        print("- Usa una contraseña de aplicación.")
        print("- Verifica que BANK_IMAP_USER sea el Gmail correcto.")
        return 1

    except Exception as exc:
        print("Error general:", exc)
        return 1

    finally:
        if imap is not None:
            try:
                imap.close()
            except Exception:
                pass

            try:
                imap.logout()
            except Exception:
                pass


if __name__ == "__main__":
    raise SystemExit(main())