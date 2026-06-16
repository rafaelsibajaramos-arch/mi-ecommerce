"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

type AuthMode = "login" | "register";

type ProfileRow = {
  id: string;
  role: string | null;
};

function getErrorMessage(error: unknown, fallback: string) {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return fallback;
}

function Particles() {
  return (
    <div className="sm-particles" aria-hidden="true">
      {Array.from({ length: 20 }).map((_, i) => (
        <span key={i} className={`sm-particle sm-p${i + 1}`} />
      ))}
    </div>
  );
}

function Logo() {
  return (
    <div className="sm-logo">
      <span className="sm-logo-s">STREAMING</span>
      <span className="sm-logo-m">MAYOR</span>
    </div>
  );
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [mode, setMode] = useState<AuthMode>("login");
  const [isRecoveryFlow, setIsRecoveryFlow] = useState(false);
  const [visible, setVisible] = useState(false);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginMessage, setLoginMessage] = useState("");
  const [loginMessageType, setLoginMessageType] = useState<"error" | "success">("error");

  const [registerFullName, setRegisterFullName] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerMessage, setRegisterMessage] = useState("");

  const publicPaths = ["/reset-password", "/recargas-automaticas"];
  const isPublicPath = publicPaths.includes(pathname) || isRecoveryFlow;

  const getOwnProfile = async (userId: string): Promise<{ profile: ProfileRow | null; errorMessage: string | null }> => {
    try {
      const { data, error } = await supabase.from("profiles").select("id, role").eq("id", userId).maybeSingle();
      if (error) return { profile: null, errorMessage: getErrorMessage(error, "No se pudo consultar tu perfil.") };
      if (!data) return { profile: null, errorMessage: "Tu cuenta fue desactivada o no tiene un perfil válido." };
      return { profile: data, errorMessage: null };
    } catch (error) {
      return { profile: null, errorMessage: getErrorMessage(error, "Ocurrió un error revisando tu perfil.") };
    }
  };

  const redirectByRole = (role: string | null | undefined) => {
    if (role === "admin") router.replace("/admin");
    else router.replace("/");
    router.refresh();
  };

  const forceLogoutInvalidProfile = async (message: string) => {
    try { await supabase.auth.signOut(); } catch {}
    setIsLoggedIn(false);
    setLoginMessage(message);
    setCheckingAuth(false);
    router.replace("/");
    router.refresh();
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const hasRecoveryCode = Boolean(searchParams.get("code"));
    const hasRecoveryTokens =
      hashParams.get("type") === "recovery" &&
      Boolean(hashParams.get("access_token")) &&
      Boolean(hashParams.get("refresh_token"));
    if (!hasRecoveryCode && !hasRecoveryTokens) {
      setIsRecoveryFlow(pathname === "/reset-password");
      return;
    }
    setIsRecoveryFlow(true);
    if (pathname !== "/reset-password") {
      router.replace(`/reset-password${window.location.search}${window.location.hash}`);
    }
  }, [pathname, router]);

  useEffect(() => {
    let mounted = true;
    const bootAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted) return;
        const user = session?.user;
        if (isPublicPath) { setIsLoggedIn(!!user); setCheckingAuth(false); return; }
        if (!user) { setIsLoggedIn(false); setCheckingAuth(false); return; }
        setIsLoggedIn(true);
        setCheckingAuth(false);
        const { profile, errorMessage } = await getOwnProfile(user.id);
        if (!mounted) return;
        if (errorMessage || !profile) console.warn("Perfil no disponible:", errorMessage || "Sin perfil");
      } catch {
        if (!mounted) return;
        setIsLoggedIn(false);
        setCheckingAuth(false);
        setLoginMessage("No se pudo verificar tu sesión.");
      }
    };
    void bootAuth();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (isPublicPath) { setIsLoggedIn(!!session?.user); setCheckingAuth(false); return; }
      if (event === "SIGNED_OUT") { setIsLoggedIn(false); setCheckingAuth(false); return; }
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
        setIsLoggedIn(!!session?.user);
        setCheckingAuth(false);
      }
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, [isPublicPath]);

  useEffect(() => {
    if (checkingAuth || isPublicPath) return;
    if (!isLoggedIn) {
      document.body.style.overflow = "hidden";
      const t = setTimeout(() => setVisible(true), 30);
      return () => { clearTimeout(t); document.body.style.overflow = ""; };
    }
  }, [checkingAuth, isLoggedIn, isPublicPath]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginMessage("");
    try {
      const cleanEmail = loginEmail.trim();
      const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password: loginPassword });
      if (error) { setLoginMessageType("error"); setLoginMessage(error.message); setLoginLoading(false); return; }
      const user = data.user;
      if (!user) { setLoginMessageType("error"); setLoginMessage("No se pudo iniciar sesión."); setLoginLoading(false); return; }
      const { profile, errorMessage } = await getOwnProfile(user.id);
      if (errorMessage || !profile) {
        await forceLogoutInvalidProfile(errorMessage || "Tu cuenta fue desactivada o no tiene un perfil válido.");
        setLoginLoading(false);
        return;
      }
      setIsLoggedIn(true);
      setLoginLoading(false);
      redirectByRole(profile.role);
    } catch (error) {
      setLoginMessageType("error");
      setLoginMessage(getErrorMessage(error, "Ocurrió un error iniciando sesión."));
      setLoginLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setLoginMessage("");
    if (!loginEmail.trim()) {
      setLoginMessageType("error");
      setLoginMessage("Escribe tu correo electrónico para recuperar tu contraseña.");
      return;
    }
    const redirectTo = typeof window !== "undefined"
      ? `${window.location.origin}/reset-password`
      : "https://streamingmayor1.com/reset-password";
    const { error } = await supabase.auth.resetPasswordForEmail(loginEmail.trim(), { redirectTo });
    if (error) { setLoginMessageType("error"); setLoginMessage(error.message); return; }
    setLoginMessageType("success");
    setLoginMessage("Te enviamos un enlace para restablecer tu contraseña.");
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterLoading(true);
    setRegisterMessage("");
    try {
      const cleanName = registerFullName.trim();
      const cleanEmail = registerEmail.trim();
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: registerPassword,
        options: { data: { full_name: cleanName } },
      });
      if (error) { setRegisterMessage(error.message); setRegisterLoading(false); return; }
      let user = data.user;
      if (!data.session) {
        const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({ email: cleanEmail, password: registerPassword });
        if (loginError) {
          setRegisterMessage("Cuenta creada. Revisa tu correo para confirmar o inicia sesión manualmente.");
          setRegisterLoading(false);
          return;
        }
        user = loginData.user;
      }
      if (!user) { setRegisterMessage("Cuenta creada, pero no se pudo obtener el usuario."); setRegisterLoading(false); return; }
      const { error: profileInsertError } = await supabase.from("profiles").insert({
        id: user.id, email: cleanEmail, full_name: cleanName, role: "user", balance: 0,
      });
      if (profileInsertError) {
        const msg = getErrorMessage(profileInsertError, "La cuenta se creó, pero no se pudo crear el perfil.");
        const isDuplicate = msg.includes("duplicate key value") || msg.includes("profiles_pkey") || msg.includes("duplicate key") || msg.includes("23505");
        if (!isDuplicate) {
          await supabase.auth.signOut();
          setRegisterMessage(msg);
          setRegisterLoading(false);
          return;
        }
        const { error: upErr } = await supabase.from("profiles").update({ email: cleanEmail, full_name: cleanName }).eq("id", user.id);
        if (upErr) console.warn("El perfil ya existía y no se pudo actualizar:", upErr);
      }
      setIsLoggedIn(true);
      setRegisterLoading(false);
      redirectByRole("user");
    } catch (error) {
      setRegisterMessage(getErrorMessage(error, "Ocurrió un error creando la cuenta."));
      setRegisterLoading(false);
    }
  };

  const showAuthModal = !checkingAuth && !isLoggedIn && !isPublicPath;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Rajdhani:wght@500;600;700&family=DM+Sans:wght@300;400;500&display=swap');

        :root {
          --red:   #DA010D;
          --red2:  #FF1A1A;
          --red3:  #8B0000;
          --black: #000000;
          --card:  rgba(8, 4, 4, 0.96);
          --br:    rgba(218, 1, 13, 0.22);
          --glow:  rgba(218, 1, 13, 0.12);
        }

        /* ── OVERLAY: fondo original con blur + gradiente rojo ── */
        .sm-overlay {
          position: fixed; inset: 0; z-index: 120;
          display: flex; align-items: center; justify-content: center;
          padding: 1rem; overflow-y: auto;
          background: radial-gradient(ellipse at 50% 0%, rgba(180,0,10,0.18) 0%, rgba(0,0,0,0.82) 60%);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
        }

        /* ── CARD: 20% más compacto + borde luminoso contenido ── */
        .sm-card {
          position: relative; width: 100%; max-width: 400px;
          background: var(--card);
          border: 1px solid rgba(218,1,13,0.5);
          border-radius: 22px; overflow: hidden;
          box-shadow:
            0 0 8px rgba(218,1,13,0.4),
            0 0 0 1px rgba(218,1,13,0.12),
            0 30px 70px rgba(0,0,0,0.85);
          animation: smglow 3s ease-in-out infinite;
          opacity: 0; transform: translateY(28px) scale(0.96);
          transition: opacity 0.5s cubic-bezier(.22,1,.36,1), transform 0.5s cubic-bezier(.22,1,.36,1);
        }
        .sm-card.sm-enter { opacity: 1; transform: translateY(0) scale(1); }

        @keyframes smglow {
          0%,100% { box-shadow: 0 0 6px rgba(218,1,13,0.3),  0 0 0 1px rgba(218,1,13,0.10), 0 30px 70px rgba(0,0,0,0.85); }
          50%      { box-shadow: 0 0 12px rgba(218,1,13,0.55), 0 0 0 1px rgba(218,1,13,0.18), 0 30px 70px rgba(0,0,0,0.85); }
        }

        /* Línea superior roja */
        .sm-card::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
          background: linear-gradient(90deg, transparent 0%, var(--red2) 30%, var(--red) 70%, transparent 100%);
        }
        /* Glow rojo interno */
        .sm-card::after {
          content: ''; position: absolute; top: -80px; left: 50%;
          transform: translateX(-50%);
          width: 280px; height: 160px;
          background: radial-gradient(ellipse, rgba(218,1,13,0.1) 0%, transparent 70%);
          pointer-events: none;
        }

        /* Corners */
        .sm-corner { position: absolute; width: 18px; height: 18px; border-color: var(--red); border-style: solid; opacity: 0.6; }
        .sm-ctlx { top: 14px; left: 14px;   border-width: 1.5px 0 0 1.5px; border-radius: 3px 0 0 0; }
        .sm-ctrx { top: 14px; right: 14px;  border-width: 1.5px 1.5px 0 0; border-radius: 0 3px 0 0; }
        .sm-cblx { bottom: 14px; left: 14px;  border-width: 0 0 1.5px 1.5px; border-radius: 0 0 0 3px; }
        .sm-cbrx { bottom: 14px; right: 14px; border-width: 0 1.5px 1.5px 0; border-radius: 0 0 3px 0; }

        /* ── BODY: padding reducido ~20% ── */
        .sm-body {
          padding: 1.75rem 1.9rem 1.45rem; position: relative; z-index: 1;
          max-height: 92vh; overflow-y: auto;
        }
        @media (max-width: 500px) {
          .sm-card  { border-radius: 14px; }
          .sm-body  { padding: .85rem .9rem .8rem; }
          .sm-logo  { margin-bottom: .65rem; }
          .sm-logo-s, .sm-logo-m { font-size: 1.15rem; }
          .sm-tabs  { margin-bottom: .65rem; padding: 2px; border-radius: 7px; }
          .sm-tab   { padding: .26rem; font-size: .68rem; }
          .sm-badge { margin-bottom: .2rem; font-size: .58rem; gap: 4px; }
          .sm-dot   { width: 5px; height: 5px; }
          .sm-title { font-size: 1.15rem; margin-bottom: .15rem; }
          .sm-sub   { font-size: .7rem; margin-bottom: .55rem; }
          .sm-divider { margin-bottom: .55rem; }
          .sm-lbl   { font-size: .6rem; margin-bottom: .18rem; }
          .sm-lbl-row { margin-bottom: .18rem; }
          .sm-field { margin-bottom: .42rem; }
          .sm-inp   { padding: .42rem .65rem; font-size: .78rem; border-radius: 8px; }
          .sm-forgot { font-size: .62rem; }
          .sm-btn   { padding: .52rem; font-size: .82rem; margin-top: .18rem; border-radius: 8px; }
          .sm-msg   { margin-top: .45rem; padding: .38rem .65rem; font-size: .72rem; border-radius: 8px; }
          .sm-switch { margin-top: .65rem; font-size: .7rem; }
          .sm-switch-btn { font-size: .74rem; }
        }

        /* Logo — texto inline igual a la captura */
        .sm-logo { margin-bottom: 1.3rem; line-height: 1; letter-spacing: -0.02em; }
        .sm-logo-s { font-family: 'Bebas Neue', sans-serif; font-size: 1.75rem; color: #DA010D; text-shadow: 0 0 14px rgba(218,1,13,0.45); }
        .sm-logo-m { font-family: 'Bebas Neue', sans-serif; font-size: 1.75rem; color: #FCFCFC; }

        /* Tabs */
        .sm-tabs {
          display: flex; background: rgba(255,255,255,0.03);
          border-radius: 9px; padding: 3px; margin-bottom: 1.2rem;
          border: 1px solid rgba(218,1,13,0.12);
        }
        .sm-tab {
          flex: 1; padding: .42rem;
          font-family: 'Rajdhani', sans-serif; font-size: .76rem; font-weight: 600;
          letter-spacing: .09em; text-transform: uppercase;
          color: rgba(255,255,255,0.3); background: none; border: none;
          border-radius: 7px; cursor: pointer; transition: all .25s;
        }
        .sm-tab.active {
          background: linear-gradient(135deg, rgba(218,1,13,0.18), rgba(139,0,0,0.12));
          color: #FF4444;
          box-shadow: 0 0 16px rgba(218,1,13,0.1);
        }

        /* Badge */
        .sm-badge {
          display: inline-flex; align-items: center; gap: 6px;
          font-family: 'Rajdhani', sans-serif; font-size: .65rem; font-weight: 600;
          letter-spacing: .18em; text-transform: uppercase; color: #FF4444; margin-bottom: .35rem;
        }
        .sm-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--red); animation: smpulse 2s ease-in-out infinite; }
        @keyframes smpulse {
          0%,100% { opacity:1; box-shadow: 0 0 0 0 rgba(218,1,13,0.6); }
          50% { opacity:.7; box-shadow: 0 0 0 6px rgba(218,1,13,0); }
        }

        .sm-title { font-family: 'Rajdhani', sans-serif; font-size: 1.7rem; font-weight: 700; color: #fff; line-height: 1.1; margin: .1rem 0 .25rem; }
        .sm-sub { font-family: 'DM Sans', sans-serif; font-size: .8rem; color: rgba(255,255,255,0.38); font-weight: 300; margin-bottom: 1rem; }
        .sm-divider { height: 1px; background: linear-gradient(90deg, transparent, rgba(218,1,13,0.2), transparent); margin-bottom: 1rem; }

        /* Inputs */
        .sm-lbl     { display: block; font-family: 'DM Sans', sans-serif; font-size: .68rem; font-weight: 500; letter-spacing: .07em; text-transform: uppercase; color: rgba(255,255,255,0.42); margin-bottom: .3rem; }
        .sm-lbl-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: .3rem; }
        .sm-field   { margin-bottom: .7rem; }
        .sm-inp {
          width: 100%; background: rgba(255,255,255,0.035); border: 1px solid rgba(218,1,13,0.18);
          border-radius: 10px; padding: .65rem .85rem; color: #fff;
          font-family: 'DM Sans', sans-serif; font-size: .88rem; outline: none;
          transition: border .25s, box-shadow .25s, background .25s; box-sizing: border-box;
        }
        .sm-inp::placeholder { color: rgba(255,255,255,0.18); }
        .sm-inp:focus {
          border-color: var(--red);
          background: rgba(218,1,13,0.05);
          box-shadow: 0 0 0 3px rgba(218,1,13,0.12), 0 0 20px rgba(218,1,13,0.06) inset;
        }
        .sm-forgot { font-family: 'DM Sans', sans-serif; font-size: .71rem; color: rgba(255,80,80,0.7); background: none; border: none; cursor: pointer; padding: 0; transition: color .2s; }
        .sm-forgot:hover { color: var(--red2); }

        /* Botón */
        .sm-btn {
          position: relative; width: 100%; margin-top: .3rem; padding: .75rem 1rem;
          font-family: 'Rajdhani', sans-serif; font-size: .95rem; font-weight: 700;
          letter-spacing: .12em; text-transform: uppercase; color: #fff;
          background: linear-gradient(135deg, #DA010D 0%, #8B0000 100%);
          border: none; border-radius: 10px; cursor: pointer; overflow: hidden;
          transition: opacity .2s, transform .15s, box-shadow .25s;
          box-shadow: 0 4px 20px rgba(218,1,13,0.4), 0 0 36px rgba(218,1,13,0.12);
        }
        .sm-btn:hover:not(:disabled) { opacity: .92; transform: translateY(-1px); box-shadow: 0 8px 28px rgba(218,1,13,0.55); }
        .sm-btn:active:not(:disabled) { transform: translateY(0); }
        .sm-btn:disabled { opacity: .5; cursor: not-allowed; }
        .sm-btn::after {
          content: ''; position: absolute; top: 0; left: -100%; width: 100%; height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent);
          transition: left .5s;
        }
        .sm-btn:hover::after { left: 100%; }

        /* Spinner */
        .sm-spin { display: inline-block; width: 13px; height: 13px; border: 2px solid rgba(255,255,255,0.25); border-top-color: #fff; border-radius: 50%; animation: smrotate .7s linear infinite; margin-right: 8px; vertical-align: middle; }
        @keyframes smrotate { to { transform: rotate(360deg); } }

        /* Mensajes */
        .sm-msg { margin-top: .7rem; padding: .55rem .85rem; border-radius: 9px; font-family: 'DM Sans', sans-serif; font-size: .8rem; text-align: center; line-height: 1.4; }
        .sm-msg.error   { background: rgba(218,1,13,0.1);   border: 1px solid rgba(218,1,13,0.25);  color: #ff8888; }
        .sm-msg.success { background: rgba(80,200,80,0.08); border: 1px solid rgba(80,200,80,0.2);  color: #88dd88; }

        /* Switch */
        .sm-switch     { margin-top: 1.1rem; text-align: center; font-family: 'DM Sans', sans-serif; font-size: .81rem; color: rgba(255,255,255,0.32); }
        .sm-switch-btn { background: none; border: none; cursor: pointer; font-family: 'Rajdhani', sans-serif; font-weight: 700; font-size: .86rem; letter-spacing: .05em; color: #FF4444; margin-left: 4px; transition: opacity .2s; padding: 0; }
        .sm-switch-btn:hover { opacity: .78; text-decoration: underline; }

        /* Partículas */
        .sm-particles { position: fixed; inset: 0; pointer-events: none; z-index: 119; overflow: hidden; }
        .sm-particle  { position: absolute; border-radius: 50%; background: var(--red); opacity: 0; animation: smfloat 9s ease-in-out infinite; }
        ${Array.from({ length: 20 }).map((_, i) => {
          const x = (Math.sin(i * 137.5) * 0.5 + 0.5) * 100;
          const y = (Math.cos(i * 97.3)  * 0.5 + 0.5) * 100;
          const sz = i % 3 === 0 ? 2 : 1;
          const delay = (i * 0.47) % 7;
          const dur = 6 + (i % 5);
          return `.sm-p${i+1}{left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;width:${sz}px;height:${sz}px;animation-delay:${delay.toFixed(1)}s;animation-duration:${dur}s;}`;
        }).join('')}
        @keyframes smfloat { 0%{opacity:0;transform:translateY(15px);} 20%{opacity:0.45;} 80%{opacity:0.25;} 100%{opacity:0;transform:translateY(-55px);} }
      `}</style>

      <div
        className={showAuthModal ? "pointer-events-none select-none brightness-50 transition duration-500" : "transition duration-500"}
        aria-hidden={showAuthModal}
      >
        {children}
      </div>

      {showAuthModal && (
        <>
          <Particles />
          <div className="sm-overlay">
            <div className={`sm-card ${visible ? "sm-enter" : ""}`}>
              <div className="sm-corner sm-ctlx" />
              <div className="sm-corner sm-ctrx" />
              <div className="sm-corner sm-cblx" />
              <div className="sm-corner sm-cbrx" />

              <div className="sm-body">
                <Logo />

                <div className="sm-tabs">
                  <button
                    type="button"
                    className={`sm-tab ${mode === "login" ? "active" : ""}`}
                    onClick={() => { setLoginMessage(""); setMode("login"); }}
                  >
                    Iniciar sesión
                  </button>
                  <button
                    type="button"
                    className={`sm-tab ${mode === "register" ? "active" : ""}`}
                    onClick={() => { setRegisterMessage(""); setMode("register"); }}
                  >
                    Crear cuenta
                  </button>
                </div>

                {mode === "login" ? (
                  <>
                    <div className="sm-badge"><span className="sm-dot" />Acceso seguro</div>
                    <h1 className="sm-title">Bienvenido de nuevo</h1>
                    <p className="sm-sub">Ingresa tus credenciales para continuar.</p>
                    <div className="sm-divider" />

                    <form onSubmit={handleLogin}>
                      <div className="sm-field">
                        <label className="sm-lbl">Correo electrónico</label>
                        <input className="sm-inp" type="email" placeholder="tucorreo@email.com" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required />
                      </div>
                      <div className="sm-field">
                        <div className="sm-lbl-row">
                          <label className="sm-lbl" style={{ marginBottom: 0 }}>Contraseña</label>
                          <button type="button" className="sm-forgot" onClick={handleForgotPassword}>¿Olvidaste tu contraseña?</button>
                        </div>
                        <input className="sm-inp" type="password" placeholder="••••••••" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} required />
                      </div>
                      <button type="submit" className="sm-btn" disabled={loginLoading}>
                        {loginLoading && <span className="sm-spin" />}
                        {loginLoading ? "Verificando..." : "Iniciar sesión"}
                      </button>
                    </form>

                    {loginMessage && <div className={`sm-msg ${loginMessageType}`}>{loginMessage}</div>}

                    <div className="sm-switch">
                      ¿No tienes cuenta?
                      <button type="button" className="sm-switch-btn" onClick={() => { setLoginMessage(""); setMode("register"); }}>Regístrate</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="sm-badge"><span className="sm-dot" />Registro nuevo</div>
                    <h1 className="sm-title">Crea tu cuenta</h1>
                    <p className="sm-sub">Únete y empieza a disfrutar al instante.</p>
                    <div className="sm-divider" />

                    <form onSubmit={handleRegister}>
                      <div className="sm-field">
                        <label className="sm-lbl">Nombre completo</label>
                        <input className="sm-inp" type="text" placeholder="Tu nombre" value={registerFullName} onChange={(e) => setRegisterFullName(e.target.value)} required />
                      </div>
                      <div className="sm-field">
                        <label className="sm-lbl">Correo electrónico</label>
                        <input className="sm-inp" type="email" placeholder="tucorreo@email.com" value={registerEmail} onChange={(e) => setRegisterEmail(e.target.value)} required />
                      </div>
                      <div className="sm-field">
                        <label className="sm-lbl">Contraseña</label>
                        <input className="sm-inp" type="password" placeholder="••••••••" value={registerPassword} onChange={(e) => setRegisterPassword(e.target.value)} required minLength={6} />
                      </div>
                      <button type="submit" className="sm-btn" disabled={registerLoading}>
                        {registerLoading && <span className="sm-spin" />}
                        {registerLoading ? "Creando cuenta..." : "Crear cuenta"}
                      </button>
                    </form>

                    {registerMessage && <div className="sm-msg error">{registerMessage}</div>}

                    <div className="sm-switch">
                      ¿Ya tienes cuenta?
                      <button type="button" className="sm-switch-btn" onClick={() => { setRegisterMessage(""); setMode("login"); }}>Inicia sesión</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
