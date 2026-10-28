import { expect, type Locator } from "@playwright/test";

/** Picks an option in a themed Select (components/Select.tsx), the app's stand-in for `<select>`. */
export async function chooseOption(
  select: Locator,
  label: string,
): Promise<void> {
  await select.click();
  await expect(select).toHaveAttribute("aria-expanded", "true");
  // The list is portalled to <body>; the combobox names it while it's open.
  const listId = await select.getAttribute("aria-controls");
  const listbox = select.page().locator(`[id="${listId}"]`);
  await listbox.getByRole("option", { name: label, exact: true }).click();
  await expect(select).toHaveAttribute("aria-expanded", "false");
  await expect(select).toHaveText(label);
}
