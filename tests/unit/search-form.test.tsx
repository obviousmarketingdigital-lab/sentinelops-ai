import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SearchForm } from "@/components/search-form";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

describe("SearchForm", () => {
  beforeEach(() => {
    cleanup();
    push.mockReset();
  });

  it("navigates with the selected search filters", () => {
    render(<SearchForm />);

    fireEvent.change(screen.getByLabelText("Localização ou termos de busca"), {
      target: { value: "Ferrugem" },
    });
    fireEvent.change(screen.getByLabelText("Tipo de imóvel"), {
      target: { value: "house" },
    });

    const comboboxes = screen.getAllByRole("combobox");
    fireEvent.change(comboboxes[1], { target: { value: "3" } });
    fireEvent.change(comboboxes[2], { target: { value: "Ferrugem" } });
    fireEvent.change(screen.getByPlaceholderText("Sem limite"), {
      target: { value: "950000" },
    });
    fireEvent.submit(screen.getByRole("button", { name: /buscar imóveis/i }).closest("form")!);

    expect(push).toHaveBeenCalledWith(
      "/resultados?query=Ferrugem&maxPrice=950000&minBedrooms=3&neighborhood=Ferrugem&type=house",
    );
  });

  it("renders values supplied by the current URL state", () => {
    render(
      <SearchForm
        compact
        initial={{
          query: "Ferrugem",
          minPrice: 500000,
          minBedrooms: 2,
          neighborhood: "Ferrugem",
          type: "house",
          source: "olx",
        }}
      />,
    );

    expect(screen.getByLabelText("Localização ou termos de busca")).toHaveValue("Ferrugem");
    expect(screen.getByLabelText("Tipo de imóvel")).toHaveValue("house");
    expect(screen.getByDisplayValue("500000")).toBeInTheDocument();
    expect(screen.getAllByRole("combobox")[1]).toHaveValue("2");
    expect(screen.getAllByRole("combobox")[3]).toHaveValue("olx");
  });
});
