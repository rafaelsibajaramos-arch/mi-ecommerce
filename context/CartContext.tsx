"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Product = {
  id: string;
  name: string;
  price: number;
  image: string;
  description?: string;
  variantId?: string | null;
  variantName?: string | null;
};

type CartItem = Product & {
  quantity: number;
};

type CartContextType = {
  cart: CartItem[];
  isCartOpen: boolean;
  addToCart: (product: Product) => void;
  increaseQuantity: (id: string, variantId?: string | null) => void;
  decreaseQuantity: (id: string, variantId?: string | null) => void;
  removeFromCart: (id: string, variantId?: string | null) => void;
  clearCart: () => void;
  openCart: () => void;
  closeCart: () => void;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

// Proveedor de contexto que centraliza el estado y las acciones del carrito.
export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  useEffect(() => {
    const savedCart = localStorage.getItem("cart");

    if (!savedCart) return;

    const frameId = window.requestAnimationFrame(() => {
      try {
        const parsedCart = JSON.parse(savedCart);
        if (Array.isArray(parsedCart)) {
          setCart(parsedCart as CartItem[]);
        }
      } catch (error) {
        console.error("No se pudo leer el carrito guardado:", error);
        localStorage.removeItem("cart");
      }
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("cart", JSON.stringify(cart));
  }, [cart]);

  // Agrega un producto al carrito y consolida cantidades cuando ya existe.
  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existingItem = prev.find(
        (item) =>
          item.id === product.id &&
          (item.variantId || null) === (product.variantId || null)
      );

      if (existingItem) {
        return prev.map((item) =>
          item.id === product.id &&
          (item.variantId || null) === (product.variantId || null)
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      return [...prev, { ...product, quantity: 1 }];
    });

    setIsCartOpen(true);
  };

  // Aumenta en una unidad la cantidad de un producto del carrito.
  const increaseQuantity = (id: string, variantId: string | null = null) => {
    setCart((prev) =>
      prev.map((item) =>
        item.id === id && (item.variantId || null) === (variantId || null)
          ? { ...item, quantity: item.quantity + 1 }
          : item
      )
    );
  };

  // Disminuye en una unidad la cantidad de un producto del carrito.
  const decreaseQuantity = (id: string, variantId: string | null = null) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.id === id && (item.variantId || null) === (variantId || null)
            ? { ...item, quantity: item.quantity - 1 }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  // Elimina por completo un producto del carrito.
  const removeFromCart = (id: string, variantId: string | null = null) => {
    setCart((prev) =>
      prev.filter(
        (item) =>
          !(
            item.id === id &&
            (item.variantId || null) === (variantId || null)
          )
      )
    );
  };

  // Vacía todo el contenido del carrito.
  const clearCart = () => {
    setCart([]);
  };

  // Abre el panel visual del carrito.
  const openCart = () => setIsCartOpen(true);
  // Cierra el panel visual del carrito.
  const closeCart = () => setIsCartOpen(false);

  return (
    <CartContext.Provider
      value={{
        cart,
        isCartOpen,
        addToCart,
        increaseQuantity,
        decreaseQuantity,
        removeFromCart,
        clearCart,
        openCart,
        closeCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

// Hook de conveniencia para consumir el contexto del carrito desde cualquier componente hijo.
export function useCart() {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCart debe usarse dentro de CartProvider");
  }

  return context;
}