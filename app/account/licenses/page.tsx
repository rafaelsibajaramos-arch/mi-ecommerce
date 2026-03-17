import DashboardSidebar from "../../../components/DashboardSidebar";

export default function AccountLicensesPage() {
  return (
    <main className="flex min-h-screen bg-[#f4f6fb]">
      <DashboardSidebar />

      <section className="flex-1 p-10">
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.2em] text-gray-500">
            Licencias
          </p>
          <h1 className="text-4xl font-extrabold mt-2">Mis licencias</h1>
        </div>

        <div className="bg-white rounded-3xl border border-black/5 p-8">
          <p className="text-gray-500">
            Aquí aparecerán las credenciales entregadas automáticamente después
            de cada compra.
          </p>
        </div>
      </section>
    </main>
  );
}