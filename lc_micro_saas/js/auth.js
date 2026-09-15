const authMessage = document.getElementById("authMessage");

function setAuthMessage(message, type = "error") {
  if (!authMessage) return;
  authMessage.textContent = message;
  authMessage.className = `form-message ${type}`;
  authMessage.hidden = false;
}

document.querySelectorAll(".password-toggle").forEach(button => {
  button.addEventListener("click", () => {
    const input = document.getElementById(button.dataset.target);
    if (!input) return;
    input.type = input.type === "password" ? "text" : "password";
    button.textContent = input.type === "password" ? "Mostrar" : "Ocultar";
  });
});

const loginForm = document.getElementById("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!window.LC_SUPABASE_CONFIGURED) {
      setAuthMessage("Conecte o projeto ao Supabase em js/config.js antes de entrar.");
      return;
    }

    const button = loginForm.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = "Entrando...";

    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    const { error } = await lcSupabase.auth.signInWithPassword({ email, password });

    button.disabled = false;
    button.textContent = "Entrar na LC";

    if (error) {
      setAuthMessage("Não foi possível entrar. Confira seu e-mail e sua senha.");
      return;
    }

    window.location.href = "dashboard.html";
  });
}

const registerForm = document.getElementById("registerForm");
if (registerForm) {
  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!window.LC_SUPABASE_CONFIGURED) {
      setAuthMessage("Conecte o projeto ao Supabase em js/config.js antes de cadastrar.");
      return;
    }

    const fullName = document.getElementById("registerName").value.trim();
    const storeName = document.getElementById("storeName").value.trim();
    const whatsapp = document.getElementById("storeWhatsapp").value.trim();
    const email = document.getElementById("registerEmail").value.trim();
    const password = document.getElementById("registerPassword").value;
    const confirm = document.getElementById("confirmPassword").value;

    if (password.length < 6) {
      setAuthMessage("A senha precisa ter no mínimo 6 caracteres.");
      return;
    }

    if (password !== confirm) {
      setAuthMessage("As senhas não coincidem.");
      return;
    }

    if (whatsapp.replace(/\D/g, "").length < 10) {
      setAuthMessage("Informe um WhatsApp válido.");
      return;
    }

    const button = registerForm.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = "Criando sua loja...";

    const { data, error } = await lcSupabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          store_name: storeName,
          whatsapp
        }
      }
    });

    button.disabled = false;
    button.textContent = "Criar minha loja";

    if (error) {
      setAuthMessage(error.message || "Não foi possível criar a conta.");
      return;
    }

    if (data.session) {
      setAuthMessage("Conta criada! Abrindo seu painel...", "success");
      setTimeout(() => window.location.href = "dashboard.html", 700);
    } else {
      setAuthMessage("Conta criada. Confirme o e-mail enviado pelo Supabase e depois faça login.", "success");
    }
  });
}

// If already logged in, skip the login/register pages.
(async function redirectAuthenticatedUser(){
  if (!window.LC_SUPABASE_CONFIGURED || !window.lcSupabase) return;
  const { data } = await lcSupabase.auth.getSession();
  if (data.session && (loginForm || registerForm)) {
    window.location.href = "dashboard.html";
  }
})();