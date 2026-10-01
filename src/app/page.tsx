export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-xl font-semibold">Histórico de preços</h1>
      <p className="mt-2 text-muted">
        Base do projeto e núcleo de análise prontos. Cadastro de produtos e captura de preços chegam
        na Etapa 2; as telas de análise, na Etapa 4.
      </p>
      <p className="mt-6 text-sm text-muted">
        Verificação do banco:{" "}
        <a className="underline" href="/api/health">
          /api/health
        </a>
      </p>
    </main>
  );
}
