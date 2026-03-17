"use client";

import Link from "next/link";
import { useCart } from "../context/CartContext";

type Product = {
  id: number;
  name: string;
  price: number;
  image: string;
  description?: string;
};

export default function ProductCard({ product }: { product: Product }) {
  const { addToCart } = useCart();

  return (
    <div className="bg-white rounded-3xl overflow-hidden border border-black/5 shadow-sm hover:shadow-xl hover:-translate-y-1 transition duration-300">
      <Link href={`/product/${product.id}`}>
        <img
          src={product.image}
          alt={product.name}
          className="w-full h-56 object-cover cursor-pointer"
        />

        <div className="p-5">
          <p className="text-sm text-gray-500">Producto digital</p>
          <h3 className="text-lg font-bold text-gray-900 mt-1">{product.name}</h3>
          <p className="text-2xl font-extrabold mt-4">${product.price}</p>
        </div>
      </Link>

      <div className="px-5 pb-5">
        <button
          onClick={() => addToCart(product)}
          className="w-full bg-[#050816] text-white py-3 rounded-2xl font-medium hover:opacity-90 transition"
        >
          Agregar al carrito
        </button>
      </div>
    </div>
  );
}
