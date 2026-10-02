import { getSupabaseClient } from "../supabase-client.js";
import { setupDashboardPhotoUpload } from "./photo-upload.js";
import { setupDashboardPhotoRecovery } from "./photo-recovery.js";

const LOGIN_PATH = "login.html";
const DASHBOARD_PATH = "dashboard.html";

export async function verifyAdminUser(client, userId) {
  const { data, error } = await client
    .from("admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data?.user_id === userId;
}

function setLoginMessage(message, state = "info") {
  const status = document.querySelector("[data-auth-message]");
  if (!status) return;
  status.textContent = message;
  status.dataset.state = state;
}

async function signOut(client) {
  const { error } = await client.auth.signOut({ scope: "local" });
  if (error) throw error;
}

async function getCurrentAuthorizedUser(client) {
  const { data, error } = await client.auth.getSession();
  if (error) throw error;

  const user = data.session?.user;
  if (!user?.id) return null;

  if (!(await verifyAdminUser(client, user.id))) {
    await signOut(client);
    return null;
  }

  return user;
}

async function getVerifiedAuthenticatedUser(client) {
  const { data, error } = await client.auth.getUser();
  if (error) throw error;

  const user = data.user;
  if (!user?.id || !(await verifyAdminUser(client, user.id))) return null;
  return user;
}

function setupLogin() {
  const form = document.querySelector("[data-admin-login]");
  if (!form) return;

  const emailInput = form.elements.namedItem("email");
  const passwordInput = form.elements.namedItem("password");
  const submitButton = form.querySelector("[type=submit]");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setLoginMessage("Verifying your administrator access…");
    submitButton.disabled = true;
    form.setAttribute("aria-busy", "true");

    let client;
    try {
      client = await getSupabaseClient();
      const { data, error } = await client.auth.signInWithPassword({
        email: emailInput.value.trim(),
        password: passwordInput.value
      });

      if (error || !data.user) {
        passwordInput.value = "";
        setLoginMessage("We couldn’t sign you in. Check your email and password and try again.", "error");
        return;
      }

      const authorized = await verifyAdminUser(client, data.user.id);
      if (!authorized) {
        try {
          await signOut(client);
          setLoginMessage("This account is not authorized for the private archive.", "error");
        } catch {
          setLoginMessage("This account is not authorized. We couldn’t safely end its session; please contact the archive administrator.", "error");
        }
        passwordInput.value = "";
        return;
      }

      window.location.assign(DASHBOARD_PATH);
    } catch {
      if (client) {
        try {
          await signOut(client);
        } catch {
          setLoginMessage("We couldn’t verify access or safely end the session. Please contact the archive administrator.", "error");
          passwordInput.value = "";
          return;
        }
      }
      passwordInput.value = "";
      setLoginMessage("Sign-in is temporarily unavailable. Please try again shortly.", "error");
    } finally {
      submitButton.disabled = false;
      form.removeAttribute("aria-busy");
    }
  });
}

function showAccessCheck(message) {
  const status = document.querySelector("[data-auth-check-message]");
  if (status) status.textContent = message;
}

function allowProtectedPage() {
  document.body.classList.remove("auth-pending");
  const check = document.querySelector("[data-auth-check]");
  if (check) check.hidden = true;
}

function setupLogout(client) {
  const buttons = [...document.querySelectorAll("[data-auth-logout]")];
  const status = document.querySelector("[data-auth-logout-message]");
  let signingOut = false;

  for (const button of buttons) {
    button.addEventListener("click", async () => {
      if (signingOut) return;
      signingOut = true;
      for (const control of buttons) control.disabled = true;
      if (status) status.textContent = "";

      try {
        await signOut(client);
        window.location.replace(LOGIN_PATH);
      } catch {
        signingOut = false;
        for (const control of buttons) control.disabled = false;
        if (status) status.textContent = "Sign-out failed. Please try again.";
      }
    });
  }
}

async function protectPage() {
  let client;
  try {
    client = await getSupabaseClient();
    const { data, error } = await client.auth.getSession();
    if (error) throw error;

    const userId = data.session?.user?.id;
    if (!userId) {
      window.location.replace(LOGIN_PATH);
      return;
    }

    if (!(await verifyAdminUser(client, userId))) {
      await signOut(client);
      showAccessCheck("This account is not authorized for the private archive.");
      return;
    }

    setupLogout(client);
    setupDashboardPhotoUpload(client, () => getCurrentAuthorizedUser(client));
    setupDashboardPhotoRecovery(client, () => getVerifiedAuthenticatedUser(client));
    allowProtectedPage();
  } catch {
    if (client) {
      try {
        await signOut(client);
      } catch {
        showAccessCheck("Administrator access could not be verified. Returning to sign in…");
        window.setTimeout(() => window.location.replace(LOGIN_PATH), 900);
        return;
      }
    }
    showAccessCheck("Administrator access could not be verified. Returning to sign in…");
    window.setTimeout(() => window.location.replace(LOGIN_PATH), 900);
  }
}

export function setupAuthentication() {
  setupLogin();
  if (document.body.hasAttribute("data-requires-admin")) void protectPage();
}
