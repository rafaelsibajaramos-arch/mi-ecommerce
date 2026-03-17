export default function AdminDashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-gray-500">
          Dashboard
        </p>
        <h1 className="text-4xl font-extrabold text-gray-900 mt-2">
          Bienvenido al panel de administración
        </h1>
        <p className="text-gray-600 mt-3">
          Desde aquí podrás controlar toda la tienda y la plataforma.
        </p>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-6">
        <div className="bg-white rounded-3xl border p-6 shadow-sm">
          <p className="text-sm text-gray-500">Productos</p>
          <h3 className="text-3xl font-extrabold mt-3">0</h3>
        </div>

        <div className="bg-white rounded-3xl border p-6 shadow-sm">
          <p className="text-sm text-gray-500">Pedidos</p>
          <h3 className="text-3xl font-extrabold mt-3">0</h3>
        </div>

        <div className="bg-white rounded-3xl border p-6 shadow-sm">
          <p className="text-sm text-gray-500">Usuarios</p>
          <h3 className="text-3xl font-extrabold mt-3">0</h3>
        </div>

        <div className="bg-white rounded-3xl border p-6 shadow-sm">
          <p className="text-sm text-gray-500">Saldo movido</p>
          <h3 className="text-3xl font-extrabold mt-3">$0</h3>
        </div>
      </div>

      <div className="grid xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-3xl border p-6 shadow-sm min-h-[260px]">
          <h2 className="text-2xl font-bold text-gray-900">
            Resumen rápido
          </h2>
          <p className="text-gray-500 mt-2">
            Aquí mostraremos actividad reciente, productos más vendidos y estado
            general del sistema.
          </p>
        </div>

        <div className="bg-white rounded-3xl border p-6 shadow-sm min-h-[260px]">
          <h2 className="text-2xl font-bold text-gray-900">
            Acciones rápidas
          </h2>
          <div className="grid sm:grid-cols-2 gap-4 mt-6">
            <button className="rounded-2xl bg-[#050816] text-white px-5 py-4 font-semibold">
              Crear producto
            </button>
            <button className="rounded-2xl border border-gray-300 px-5 py-4 font-semibold">
              Ver pedidos
            </button>
            <button className="rounded-2xl border border-gray-300 px-5 py-4 font-semibold">
              Gestionar saldo
            </button>
            <button className="rounded-2xl border border-gray-300 px-5 py-4 font-semibold">
              Ver usuarios
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}