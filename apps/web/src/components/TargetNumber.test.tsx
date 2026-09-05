import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TargetNumber } from "./TargetNumber.js";

describe("TargetNumber", () => {
  it("complète sur 3 chiffres quand le pool tient sous 1000", () => {
    render(<TargetNumber id={25} maxId={151} />);
    expect(screen.getByText("025")).toBeInTheDocument();
  });

  it("complète sur 4 chiffres pour le pool national", () => {
    render(<TargetNumber id={782} maxId={1025} />);
    expect(screen.getByText("0782")).toBeInTheDocument();
  });

  it("annonce le numéro aux lecteurs d'écran", () => {
    render(<TargetNumber id={25} maxId={151} />);
    expect(screen.getByLabelText("Numéro cible 25")).toBeInTheDocument();
  });

  it("épingle la frontière : maxId = 999 rend 3 chiffres", () => {
    render(<TargetNumber id={7} maxId={999} />);
    expect(screen.getByText("007")).toBeInTheDocument();
  });

  it("épingle la frontière : maxId = 1000 rend 4 chiffres", () => {
    render(<TargetNumber id={7} maxId={1000} />);
    expect(screen.getByText("0007")).toBeInTheDocument();
  });
});
