import { NewProductForm } from "./NewProductForm";

export default function NewProductPage() {
  return (
    <>
      <h1 className="text-lg font-semibold">Cadastrar produto</h1>
      <p className="mt-1 text-sm text-muted">
        Só o ASIN é extraído do link. Nenhum acesso à Amazon é feito pelo sistema.
      </p>
      <NewProductForm />
    </>
  );
}
