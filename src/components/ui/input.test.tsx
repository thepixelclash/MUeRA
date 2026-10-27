import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useState } from "react";
import { Input } from "./input";
afterEach(cleanup);
function Field() {
  const [n, setN] = useState(8);
  return (
    <Input
      aria-label="count"
      type="number"
      value={n}
      onChange={(e) => setN(Number(e.target.value))}
    />
  );
}
it("keeps cleared numeric drafts empty and normalizes leading zeros", () => {
  render(<Field />);
  const input = screen.getByLabelText("count");
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "" } });
  expect(input).toHaveValue("");
  fireEvent.blur(input);
  expect(input).toHaveValue("");
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "011" } });
  expect(input).toHaveValue("11");
  fireEvent.change(input, { target: { value: "-1" } });
  expect(input).toHaveValue("11");
  fireEvent.change(input, { target: { value: "1.2" } });
  expect(input).toHaveValue("11");
});
