/* Авторизация клиента на витрине: вход по email+паролю, переключатель роли,
 * хранение токена. Публикует window.ProfiAuth и события profi:auth / profi:role,
 * по которым страница товара перезапрашивает цены. Без зависимостей. */
(function () {
  "use strict";
  var slot = document.getElementById("auth-slot");
  if (!slot) return;

  var API = (slot.getAttribute("data-api") || "").replace(/\/$/, "");
  var ICON = slot.querySelector("img") ? slot.querySelector("img").getAttribute("src") : "ic-user.svg";
  var CH_NAME = { individuals: "Розница", clinics: "Клиника", distributors: "Дистрибьютор", government: "Госзаказчик" };

  function esc(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; }

  function load() {
    var token = localStorage.getItem("profi_token") || "";
    var client = null;
    try { client = JSON.parse(localStorage.getItem("profi_client") || "null"); } catch (e) {}
    var role = localStorage.getItem("profi_role") || "";
    if (!token || !client) { token = ""; client = null; role = ""; }
    if (client && client.channels && client.channels.indexOf(role) === -1) {
      role = client.channels.indexOf("individuals") !== -1 ? "individuals" : (client.channels[0] || "");
    }
    window.ProfiAuth = { token: token, client: client, activeRole: role, api: API };
  }

  function save(token, client) {
    localStorage.setItem("profi_token", token);
    localStorage.setItem("profi_client", JSON.stringify(client));
    var role = (client.channels && client.channels.indexOf("individuals") !== -1)
      ? "individuals" : ((client.channels && client.channels[0]) || "");
    localStorage.setItem("profi_role", role);
  }

  function clearStore() {
    localStorage.removeItem("profi_token");
    localStorage.removeItem("profi_client");
    localStorage.removeItem("profi_role");
  }

  function setRole(ch) {
    window.ProfiAuth.activeRole = ch;
    localStorage.setItem("profi_role", ch);
    window.dispatchEvent(new Event("profi:role"));
  }

  function doLogin(email, pw, errEl, btn) {
    errEl.hidden = true; btn.disabled = true;
    fetch(API + "/api/auth/login/", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email: email, password: pw }),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) throw new Error(data.error || ("Ошибка входа (" + r.status + ")"));
        return data;
      });
    }).then(function (data) {
      save(data.token, data.client);
      load(); render();
      window.dispatchEvent(new Event("profi:auth"));
    }).catch(function (e) {
      errEl.textContent = e.message; errEl.hidden = false; btn.disabled = false;
    });
  }

  function logout() {
    var a = window.ProfiAuth;
    if (a.token) {
      fetch(API + "/api/auth/logout/", { method: "POST", headers: { Authorization: "Bearer " + a.token } }).catch(function () {});
    }
    clearStore(); load(); render();
    window.dispatchEvent(new Event("profi:auth"));
  }

  function render() {
    var a = window.ProfiAuth;
    if (a.token && a.client) {
      var chans = a.client.channels || [];
      var roleCtl = chans.length > 1
        ? '<select class="auth-role" title="Роль и цены">' + chans.map(function (c) {
            return '<option value="' + c + '"' + (c === a.activeRole ? " selected" : "") + ">" + esc(CH_NAME[c] || c) + "</option>";
          }).join("") + "</select>"
        : '<span class="auth-role-1">' + esc(CH_NAME[a.activeRole] || "") + "</span>";
      slot.innerHTML =
        '<div class="auth-user">' +
          '<span class="auth-name" title="' + esc(a.client.email) + '">' + esc(a.client.name || a.client.email) + "</span>" +
          roleCtl +
          '<button type="button" class="auth-logout">Выйти</button>' +
        "</div>";
      var sel = slot.querySelector(".auth-role");
      if (sel) sel.addEventListener("change", function () { setRole(sel.value); });
      slot.querySelector(".auth-logout").addEventListener("click", logout);
    } else {
      slot.innerHTML =
        '<a class="auth-login" href="#"><img src="' + esc(ICON) + '" alt="" width="24" height="24"><span>Войти</span></a>' +
        '<div class="auth-pop" hidden>' +
          '<div class="auth-pop-t">Вход для клиентов</div>' +
          '<input type="email" class="auth-email" placeholder="Email" autocomplete="username">' +
          '<input type="password" class="auth-pass" placeholder="Пароль" autocomplete="current-password">' +
          '<div class="auth-err" hidden></div>' +
          '<button type="button" class="auth-submit">Войти</button>' +
        "</div>";
      wireLogin();
    }
  }

  function wireLogin() {
    var link = slot.querySelector(".auth-login");
    var pop = slot.querySelector(".auth-pop");
    if (!link || !pop) return;
    link.addEventListener("click", function (e) {
      e.preventDefault();
      pop.hidden = !pop.hidden;
      if (!pop.hidden) slot.querySelector(".auth-email").focus();
    });
    slot.querySelector(".auth-submit").addEventListener("click", function () {
      doLogin(slot.querySelector(".auth-email").value.trim(), slot.querySelector(".auth-pass").value,
              slot.querySelector(".auth-err"), this);
    });
    slot.querySelector(".auth-pass").addEventListener("keydown", function (e) {
      if (e.key === "Enter") slot.querySelector(".auth-submit").click();
    });
  }

  document.addEventListener("click", function (e) {
    var pop = slot.querySelector(".auth-pop");
    if (pop && !slot.contains(e.target)) pop.hidden = true;
  });

  load();
  render();
  window.dispatchEvent(new Event("profi:auth"));
})();
