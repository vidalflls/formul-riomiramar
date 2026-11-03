// Reservas Miramar — front-end
(() => {
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  let atendente = null;
  let editando = null; // reserva que está sendo editada (ou null)

  // ---------- datas ----------

  const iso = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const deIso = (s) => {
    const [a, m, d] = s.split("-").map(Number);
    return new Date(a, m - 1, d);
  };

  const somaDias = (d, n) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };

  const hoje = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const dataCurta = (s) =>
    deIso(s).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });

  const dataLonga = (s) =>
    deIso(s).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const qtd = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

  const momento = (s) => {
    const d = new Date(s);
    return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  };

  // ---------- comunicação com o servidor ----------

  async function api(metodo, url, corpo) {
    const resp = await fetch(url, {
      method: metodo,
      headers: corpo ? { "Content-Type": "application/json" } : {},
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const dados = await resp.json().catch(() => ({}));
    if (resp.status === 401 && url !== "/api/entrar") {
      mostrarEntrada();
    }
    return { ok: resp.ok, status: resp.status, dados };
  }

  // ---------- entrada ----------

  async function iniciar() {
    const { dados } = await api("GET", "/api/eu");
    $("#campo-senha").hidden = !dados.pede_senha;
    if (dados.nome) {
      abrirSistema(dados.nome);
    } else {
      mostrarEntrada();
    }
  }

  function mostrarEntrada() {
    $("#tela-app").hidden = true;
    $("#tela-entrada").hidden = false;
    $("#form-entrada [name=nome]").focus();
  }

  $("#form-entrada").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const { ok, dados } = await api("POST", "/api/entrar", {
      nome: f.nome.value,
      senha: f.senha.value,
    });
    if (!ok) {
      $("#erro-entrada").textContent = dados.erro || "Não deu para entrar.";
      return;
    }
    f.senha.value = "";
    $("#erro-entrada").textContent = "";
    abrirSistema(dados.nome);
  });

  $("#btn-sair").addEventListener("click", async () => {
    atendente = null;
    $("#form-entrada [name=nome]").value = "";
    $("#aviso").hidden = true;
    await api("POST", "/api/sair", {});
    mostrarEntrada();
  });

  function abrirSistema(nome) {
    atendente = nome;
    $("#nome-atendente").textContent = nome;
    $("#tela-entrada").hidden = true;
    $("#tela-app").hidden = false;
    limparFormulario();
    trocarAba("nova");
  }

  // ---------- abas ----------

  function trocarAba(qual) {
    $$(".aba").forEach((b) => b.classList.toggle("ativa", b.dataset.aba === qual));
    $("#aba-nova").hidden = qual !== "nova";
    $("#aba-lista").hidden = qual !== "lista";
    if (qual === "lista") carregarLista();
  }

  $$(".aba").forEach((b) => b.addEventListener("click", () => trocarAba(b.dataset.aba)));

  // ---------- formulário ----------

  const form = $("#form-reserva");

  // máscara simples de telefone brasileiro; se começar com +, deixa como está
  form.telefone.addEventListener("input", () => {
    const v = form.telefone.value;
    if (v.trim().startsWith("+")) return;
    const d = v.replace(/\D/g, "").slice(0, 11);
    let s = d;
    if (d.length > 2) s = `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length > 6) {
      const meio = d.length === 11 ? 7 : 6;
      s = `(${d.slice(0, 2)}) ${d.slice(2, meio)}-${d.slice(meio)}`;
    }
    form.telefone.value = s;
  });

  function limparErros() {
    $$("[data-erro]", form).forEach((el) => (el.textContent = ""));
    $$(".invalido", form).forEach((el) => el.classList.remove("invalido"));
  }

  function mostrarErros(erros) {
    limparErros();
    for (const [campo, msg] of Object.entries(erros)) {
      const alvo = $(`[data-erro="${campo}"]`, form);
      if (alvo) alvo.textContent = msg;
      const input = form.elements[campo];
      if (input && input.classList) input.classList.add("invalido");
    }
    const primeiro = Object.keys(erros)[0];
    const el = form.elements[primeiro];
    if (el && el.focus) el.focus();
    else if (el && el[0]) el[0].focus();
  }

  function lerFormulario() {
    const jac = form.jacuzzi.value;
    return {
      cliente: form.cliente.value,
      data: form.data.value,
      pessoas: form.pessoas.value,
      local: form.local.value,
      telefone: form.telefone.value,
      jacuzzi: jac === "sim" ? true : jac === "nao" ? false : null,
    };
  }

  // mesma conferência do servidor, só para avisar antes de enviar
  function conferir(r) {
    const e = {};
    if (!r.cliente.trim()) e.cliente = "Informe o nome do cliente.";
    if (!r.data) e.data = "Escolha a data da reserva.";
    if (!(Number(r.pessoas) >= 1)) e.pessoas = "Quantas pessoas? (pelo menos 1)";
    if (r.telefone.replace(/\D/g, "").length < 8) e.telefone = "Telefone incompleto.";
    if (!r.local.trim()) e.local = 'Anote a preferência de local (ou "sem preferência").';
    if (r.jacuzzi === null) e.jacuzzi = "Marque se a jacuzzi está incluída.";
    return e;
  }

  function limparFormulario() {
    editando = null;
    form.reset();
    limparErros();
    $("#titulo-form").textContent = "Nova reserva";
    $("#btn-salvar").textContent = "Salvar reserva";
    $("#btn-cancelar-edicao").hidden = true;
    $("#info-registro").textContent = `Será registrada no nome de ${atendente}.`;
  }

  function editar(r) {
    editando = r;
    limparErros();
    form.cliente.value = r.cliente;
    form.data.value = r.data;
    form.pessoas.value = r.pessoas;
    form.telefone.value = r.telefone;
    form.local.value = r.local;
    form.jacuzzi.value = r.jacuzzi ? "sim" : "nao";
    $("#titulo-form").textContent = `Editando reserva de ${r.cliente}`;
    $("#btn-salvar").textContent = "Salvar alterações";
    $("#btn-cancelar-edicao").hidden = false;
    $("#info-registro").textContent = textoQuem(r);
    $("#aviso").hidden = true;
    trocarAba("nova");
    form.cliente.focus();
  }

  $("#btn-cancelar-edicao").addEventListener("click", () => {
    limparFormulario();
    trocarAba("lista");
  });

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const r = lerFormulario();
    const erros = conferir(r);
    if (Object.keys(erros).length) return mostrarErros(erros);

    const botao = $("#btn-salvar");
    botao.disabled = true;
    const { ok, dados } = editando
      ? await api("PUT", `/api/reservas/${editando.id}`, r)
      : await api("POST", "/api/reservas", r);
    botao.disabled = false;

    if (!ok) {
      if (dados.erros) return mostrarErros(dados.erros);
      return avisar(dados.erro || "Algo deu errado ao salvar. Tente de novo.");
    }

    const eraEdicao = Boolean(editando);
    limparFormulario();

    if (eraEdicao) {
      trocarAba("lista");
      return;
    }

    const pessoas = qtd(dados.pessoas, "pessoa", "pessoas");
    avisar(
      `Reserva de <strong></strong> salva para ${dataLonga(dados.data)}, ${pessoas}. ` +
        `Registrada por <strong></strong>. <button class="link" id="ver-lista">Ver na lista</button>`,
      [dados.cliente, dados.registrado_por]
    );
    $("#ver-lista").addEventListener("click", () => {
      $("#f-de").value = dados.data;
      $("#f-ate").value = dados.data;
      marcarAtalho(null);
      trocarAba("lista");
    });
    form.cliente.focus();
  });

  // html fixo + textos do usuário entram via textContent nos <strong>
  function avisar(html, textos = []) {
    const caixa = $("#aviso");
    caixa.innerHTML = html;
    $$("strong", caixa).forEach((el, i) => (el.textContent = textos[i] ?? ""));
    caixa.hidden = false;
  }

  // ---------- lista e filtros ----------

  const filtroDe = $("#f-de");
  const filtroAte = $("#f-ate");
  let atalhoAtual = "proximas";

  function marcarAtalho(nome) {
    atalhoAtual = nome;
    $$("[data-atalho]").forEach((b) => b.classList.toggle("ativo", b.dataset.atalho === nome));
  }

  function aplicarAtalho(nome) {
    const h = hoje();
    let de = "", ate = "";
    if (nome === "hoje") de = ate = iso(h);
    if (nome === "amanha") de = ate = iso(somaDias(h, 1));
    if (nome === "7dias") { de = iso(h); ate = iso(somaDias(h, 6)); }
    if (nome === "proximas") de = iso(h);
    if (nome === "mes") {
      de = iso(new Date(h.getFullYear(), h.getMonth(), 1));
      ate = iso(new Date(h.getFullYear(), h.getMonth() + 1, 0));
    }
    if (nome === "fds") {
      const dia = h.getDay(); // 0 = domingo, 6 = sábado
      if (dia === 0) { de = ate = iso(h); }
      else {
        const sabado = somaDias(h, 6 - dia);
        de = iso(sabado);
        ate = iso(somaDias(sabado, 1));
      }
    }
    filtroDe.value = de;
    filtroAte.value = ate;
    marcarAtalho(nome);
    carregarLista();
  }

  $$("[data-atalho]").forEach((b) => b.addEventListener("click", () => aplicarAtalho(b.dataset.atalho)));

  [filtroDe, filtroAte].forEach((el) =>
    el.addEventListener("change", () => {
      marcarAtalho(null);
      carregarLista();
    })
  );
  $("#f-jacuzzi").addEventListener("change", carregarLista);
  $("#f-por").addEventListener("change", carregarLista);

  let espera;
  $("#f-busca").addEventListener("input", () => {
    clearTimeout(espera);
    espera = setTimeout(carregarLista, 250);
  });

  let pedido = 0;
  async function carregarLista() {
    const params = new URLSearchParams();
    if (filtroDe.value) params.set("de", filtroDe.value);
    if (filtroAte.value) params.set("ate", filtroAte.value);
    if ($("#f-busca").value.trim()) params.set("busca", $("#f-busca").value.trim());
    if ($("#f-jacuzzi").value) params.set("jacuzzi", $("#f-jacuzzi").value);
    if ($("#f-por").value) params.set("por", $("#f-por").value);

    const meu = ++pedido;
    const { ok, dados } = await api("GET", `/api/reservas?${params}`);
    if (meu !== pedido || !ok) return; // chegou uma resposta mais nova
    atualizarEquipe(dados.equipe);
    desenharLista(dados.reservas);
  }

  function atualizarEquipe(nomes) {
    const sel = $("#f-por");
    const atual = sel.value;
    sel.length = 1;
    for (const n of nomes) sel.add(new Option(n, n));
    sel.value = nomes.includes(atual) ? atual : "";
  }

  function textoQuem(r) {
    let t = `Registrada por ${r.registrado_por} em ${momento(r.registrado_em)}`;
    if (r.alterado_por) t += ` · alterada por ${r.alterado_por} em ${momento(r.alterado_em)}`;
    return t + ".";
  }

  function linkWhats(tel) {
    let d = tel.replace(/\D/g, "");
    if (d.length === 10 || d.length === 11) d = "55" + d;
    return `https://wa.me/${d}`;
  }

  function desenharLista(reservas) {
    const lista = $("#lista");
    lista.replaceChildren();

    const totalPessoas = reservas.reduce((s, r) => s + r.pessoas, 0);
    const comJac = reservas.filter((r) => r.jacuzzi).length;
    $("#resumo").textContent = reservas.length
      ? `${qtd(reservas.length, "reserva", "reservas")} · ${qtd(totalPessoas, "pessoa", "pessoas")} · ${comJac} com jacuzzi`
      : "";

    if (!reservas.length) {
      const p = document.createElement("p");
      p.className = "vazio";
      p.textContent = "Nenhuma reserva encontrada com esses filtros.";
      lista.append(p);
      return;
    }

    const porDia = new Map();
    for (const r of reservas) {
      if (!porDia.has(r.data)) porDia.set(r.data, []);
      porDia.get(r.data).push(r);
    }

    const tpl = $("#tpl-reserva");
    const hojeIso = iso(hoje());

    for (const [dia, doDia] of porDia) {
      const cab = document.createElement("div");
      cab.className = "dia" + (dia === hojeIso ? " hoje" : "");
      const h3 = document.createElement("h3");
      h3.textContent = dataLonga(dia);
      const info = document.createElement("span");
      const p = doDia.reduce((s, r) => s + r.pessoas, 0);
      info.textContent = `${qtd(doDia.length, "reserva", "reservas")} · ${qtd(p, "pessoa", "pessoas")}`;
      cab.append(h3, info);
      lista.append(cab);

      for (const r of doDia) {
        const el = tpl.content.firstElementChild.cloneNode(true);
        $(".r-cliente", el).textContent = r.cliente;
        $(".r-pessoas", el).textContent = qtd(r.pessoas, "pessoa", "pessoas");
        const selo = $(".r-jacuzzi", el);
        selo.textContent = r.jacuzzi ? "com jacuzzi" : "sem jacuzzi";
        selo.classList.toggle("sim", r.jacuzzi);
        $(".r-local", el).textContent = r.local;
        const tel = $(".r-tel", el);
        tel.textContent = r.telefone;
        tel.href = `tel:${r.telefone.replace(/[^\d+]/g, "")}`;
        $(".r-whats", el).href = linkWhats(r.telefone);
        $(".r-quem", el).textContent = textoQuem(r);
        $(".r-editar", el).addEventListener("click", () => editar(r));
        $(".r-apagar", el).addEventListener("click", () => apagar(r));
        lista.append(el);
      }
    }
  }

  async function apagar(r) {
    if (!confirm(`Apagar a reserva de ${r.cliente} (${dataCurta(r.data)})? Não dá para desfazer.`)) return;
    const { ok } = await api("DELETE", `/api/reservas/${r.id}`);
    if (ok) carregarLista();
  }

  // ao abrir a lista pela primeira vez, mostra as próximas reservas
  filtroDe.value = iso(hoje());
  marcarAtalho("proximas");

  iniciar();
})();
