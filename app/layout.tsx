import type { Metadata } from "next";
import "./globals.css";
import { CartProvider } from "../context/CartContext";
import CartDrawer from "../components/CartDrawer";
import Navbar from "../components/Navbar";
import ShootingStars from "../components/ShootingStars";

export const metadata: Metadata = {
  title: "Mi Ecommerce",
  description: "Tienda online moderna",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <div className="site-background" aria-hidden="true">
          <div className="site-gradient" />
          <div className="site-vignette" />

          <span className="floating-dot dot-1" />
          <span className="floating-dot dot-2" />
          <span className="floating-dot dot-3" />
          <span className="floating-dot dot-4" />
          <span className="floating-dot dot-5" />
          <span className="floating-dot dot-6" />
          <span className="floating-dot dot-7" />
          <span className="floating-dot dot-8" />
          <span className="floating-dot dot-9" />
          <span className="floating-dot dot-10" />
        </div>

        <ShootingStars />

        <CartProvider>
          <Navbar />
          <div className="relative z-10">{children}</div>
          <CartDrawer />
        </CartProvider>
      </body>
    </html>
  );
}