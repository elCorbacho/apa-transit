import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import UserManager from "../src/app/user-manager";

const state = vi.hoisted(() => ({ values: [] as unknown[] }));
vi.mock("react", async importOriginal => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: (initial: unknown) => [state.values.length ? state.values.shift() : initial, vi.fn()],
  useEffect: vi.fn()
}));

const user = {
  id: "user-1", username: "test-admin", fullName: "Test Admin",
  email: "admin@example.test", role: "admin", isActive: true
};

it("renders labeled forms and separates account actions from account details", () => {
  state.values = [[user], false, null, null, false, true];
  const create = renderToStaticMarkup(<UserManager onExpired={vi.fn()} />);
  expect(create).toContain('<form class="user-form user-form-create"');
  for (const label of ["Username", "Full name", "Email", "Password", "Role"]) {
    expect(create).toContain(`<label>${label}<`);
  }
  expect(create).toMatch(/class="user-actions"[^>]*><button[^>]*>Edit<\/button><button[^>]*>Deactivate/);

  state.values = [[user], false, null, user.id, false, false];
  const edit = renderToStaticMarkup(<UserManager onExpired={vi.fn()} />);
  for (const label of ["Full name", "Email", "New password", "Role"]) {
    expect(edit).toContain(`<label>${label}<`);
  }
});
