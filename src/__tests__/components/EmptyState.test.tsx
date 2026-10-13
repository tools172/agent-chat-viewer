import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "../../components/common/EmptyState";

describe("EmptyState", () => {
  it("should render title", () => {
    render(<EmptyState title="Test Title" />);
    expect(screen.getByText("Test Title")).toBeInTheDocument();
  });

  it("should render description when provided", () => {
    render(<EmptyState title="Title" description="This is a description" />);
    expect(screen.getByText("This is a description")).toBeInTheDocument();
  });

  it("should render action when provided", () => {
    render(<EmptyState title="Title" action={<button>Click me</button>} />);
    expect(screen.getByText("Click me")).toBeInTheDocument();
  });
});
