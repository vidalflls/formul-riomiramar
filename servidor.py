"""
Reservas do Restaurante Miramar.

Servidor pequeno, só com a biblioteca padrão do Python (3.9 ou mais novo).
Os dados ficam no arquivo reservas.db, ao lado deste script.

Para rodar:
    python3 servidor.py

Variáveis opcionais:
    MIRAMAR_SENHA   senha da equipe (sem ela, basta informar o nome para entrar)
    MIRAMAR_PORTA   porta do servidor (padrão 8000)
"""

import hmac
import json
import os
import re
import secrets
import sqlite3
import threading
from datetime import date, datetime, timezone
from http import cookies
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

PASTA = Path(__file__).resolve().parent
PASTA_STATIC = PASTA / "static"
BANCO = Path(os.environ.get("MIRAMAR_BANCO", PASTA / "reservas.db"))
SENHA = os.environ.get("MIRAMAR_SENHA", "")
PORTA = int(os.environ.get("MIRAMAR_PORTA", "8000"))
COOKIE = "miramar_sessao"

TIPOS = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".png": "image/png",
}

trava = threading.Lock()


def conectar():
    con = sqlite3.connect(BANCO)
    con.row_factory = sqlite3.Row
    return con


def preparar_banco():
    with conectar() as con:
        con.executescript(
            """
            CREATE TABLE IF NOT EXISTS reservas (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                cliente       TEXT    NOT NULL,
                data          TEXT    NOT NULL,
                pessoas       INTEGER NOT NULL,
                local         TEXT    NOT NULL,
                telefone      TEXT    NOT NULL,
                jacuzzi       INTEGER NOT NULL,
                registrado_por TEXT   NOT NULL,
                registrado_em  TEXT   NOT NULL,
                alterado_por   TEXT,
                alterado_em    TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_reservas_data ON reservas (data);

            CREATE TABLE IF NOT EXISTS sessoes (
                token     TEXT PRIMARY KEY,
                nome      TEXT NOT NULL,
                criada_em TEXT NOT NULL
            );
            """
        )


def agora():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def como_dict(linha):
    r = dict(linha)
    r["jacuzzi"] = bool(r["jacuzzi"])
    return r


def validar(dados):
    """Confere os campos do formulário. Devolve (reserva, erros)."""
    erros = {}

    cliente = str(dados.get("cliente", "")).strip()
    if not cliente:
        erros["cliente"] = "Informe o nome do cliente."

    data_txt = str(dados.get("data", "")).strip()
    try:
        date.fromisoformat(data_txt)
    except ValueError:
        erros["data"] = "Escolha a data da reserva."

    try:
        pessoas = int(dados.get("pessoas"))
        if pessoas < 1 or pessoas > 500:
            raise ValueError
    except (TypeError, ValueError):
        pessoas = 0
        erros["pessoas"] = "Quantas pessoas? (pelo menos 1)"

    local = str(dados.get("local", "")).strip()
    if not local:
        erros["local"] = "Anote a preferência de local (ou \"sem preferência\")."

    telefone = str(dados.get("telefone", "")).strip()
    if len(re.sub(r"\D", "", telefone)) < 8:
        erros["telefone"] = "Telefone incompleto."

    jacuzzi = dados.get("jacuzzi")
    if not isinstance(jacuzzi, bool):
        erros["jacuzzi"] = "Marque se a jacuzzi está incluída."

    reserva = {
        "cliente": cliente,
        "data": data_txt,
        "pessoas": pessoas,
        "local": local,
        "telefone": telefone,
        "jacuzzi": 1 if jacuzzi else 0,
    }
    return reserva, erros


class Handler(BaseHTTPRequestHandler):
    server_version = "Miramar"

    # ---------- utilidades ----------

    def log_message(self, formato, *args):
        print("[%s] %s" % (self.log_date_time_string(), formato % args))

    def responder(self, status, corpo=None, extra=None):
        dados = json.dumps(corpo if corpo is not None else {}, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(dados)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(dados)

    def ler_json(self):
        if "application/json" not in self.headers.get("Content-Type", ""):
            return None
        tamanho = int(self.headers.get("Content-Length") or 0)
        if tamanho > 100_000:
            return None
        try:
            return json.loads(self.rfile.read(tamanho) or b"{}")
        except json.JSONDecodeError:
            return None

    def token(self):
        bruto = self.headers.get("Cookie")
        if not bruto:
            return None
        c = cookies.SimpleCookie()
        try:
            c.load(bruto)
        except cookies.CookieError:
            return None
        return c[COOKIE].value if COOKIE in c else None

    def usuario(self):
        tok = self.token()
        if not tok:
            return None
        with conectar() as con:
            linha = con.execute("SELECT nome FROM sessoes WHERE token = ?", (tok,)).fetchone()
        return linha["nome"] if linha else None

    def arquivo(self, caminho):
        alvo = (PASTA_STATIC / caminho).resolve()
        if PASTA_STATIC not in alvo.parents or not alvo.is_file():
            self.send_error(404)
            return
        dados = alvo.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", TIPOS.get(alvo.suffix, "application/octet-stream"))
        self.send_header("Content-Length", str(len(dados)))
        self.end_headers()
        self.wfile.write(dados)

    # ---------- rotas ----------

    def do_GET(self):
        url = urlparse(self.path)

        if url.path == "/":
            return self.arquivo("index.html")
        if url.path.startswith("/static/"):
            return self.arquivo(url.path[len("/static/"):])

        if url.path == "/api/eu":
            return self.responder(200, {"nome": self.usuario(), "pede_senha": bool(SENHA)})

        if url.path == "/api/reservas":
            if not self.usuario():
                return self.responder(401, {"erro": "Entre com seu nome primeiro."})
            return self.listar(parse_qs(url.query))

        self.send_error(404)

    def do_POST(self):
        caminho = urlparse(self.path).path
        dados = self.ler_json()
        if dados is None:
            return self.responder(400, {"erro": "Requisição inválida."})

        if caminho == "/api/entrar":
            return self.entrar(dados)
        if caminho == "/api/sair":
            return self.sair()

        nome = self.usuario()
        if not nome:
            return self.responder(401, {"erro": "Sua sessão expirou. Entre de novo."})

        if caminho == "/api/reservas":
            reserva, erros = validar(dados)
            if erros:
                return self.responder(422, {"erros": erros})
            reserva.update(registrado_por=nome, registrado_em=agora())
            with trava, conectar() as con:
                cur = con.execute(
                    """INSERT INTO reservas
                       (cliente, data, pessoas, local, telefone, jacuzzi, registrado_por, registrado_em)
                       VALUES (:cliente, :data, :pessoas, :local, :telefone, :jacuzzi,
                               :registrado_por, :registrado_em)""",
                    reserva,
                )
                linha = con.execute("SELECT * FROM reservas WHERE id = ?", (cur.lastrowid,)).fetchone()
            return self.responder(201, como_dict(linha))

        self.send_error(404)

    def do_PUT(self):
        m = re.fullmatch(r"/api/reservas/(\d+)", urlparse(self.path).path)
        if not m:
            return self.send_error(404)
        nome = self.usuario()
        if not nome:
            return self.responder(401, {"erro": "Sua sessão expirou. Entre de novo."})
        dados = self.ler_json()
        if dados is None:
            return self.responder(400, {"erro": "Requisição inválida."})

        reserva, erros = validar(dados)
        if erros:
            return self.responder(422, {"erros": erros})
        reserva.update(id=int(m.group(1)), alterado_por=nome, alterado_em=agora())
        with trava, conectar() as con:
            cur = con.execute(
                """UPDATE reservas SET cliente = :cliente, data = :data, pessoas = :pessoas,
                       local = :local, telefone = :telefone, jacuzzi = :jacuzzi,
                       alterado_por = :alterado_por, alterado_em = :alterado_em
                   WHERE id = :id""",
                reserva,
            )
            if cur.rowcount == 0:
                return self.responder(404, {"erro": "Essa reserva não existe mais."})
            linha = con.execute("SELECT * FROM reservas WHERE id = ?", (reserva["id"],)).fetchone()
        return self.responder(200, como_dict(linha))

    def do_DELETE(self):
        m = re.fullmatch(r"/api/reservas/(\d+)", urlparse(self.path).path)
        if not m:
            return self.send_error(404)
        nome = self.usuario()
        if not nome:
            return self.responder(401, {"erro": "Sua sessão expirou. Entre de novo."})
        with trava, conectar() as con:
            linha = con.execute("SELECT cliente, data FROM reservas WHERE id = ?", (m.group(1),)).fetchone()
            con.execute("DELETE FROM reservas WHERE id = ?", (m.group(1),))
        if linha:
            print(f"Reserva {m.group(1)} ({linha['cliente']}, {linha['data']}) apagada por {nome}")
        return self.responder(200, {"ok": True})

    # ---------- ações ----------

    def entrar(self, dados):
        nome = " ".join(str(dados.get("nome", "")).split())[:60]
        if not nome:
            return self.responder(422, {"erro": "Diga seu nome para a gente saber quem registrou."})
        if SENHA and not hmac.compare_digest(str(dados.get("senha", "")).encode(), SENHA.encode()):
            return self.responder(403, {"erro": "Senha errada."})
        tok = secrets.token_urlsafe(32)
        with trava, conectar() as con:
            con.execute("INSERT INTO sessoes (token, nome, criada_em) VALUES (?, ?, ?)", (tok, nome, agora()))
        biscoito = f"{COOKIE}={tok}; Path=/; HttpOnly; SameSite=Lax; Max-Age={60 * 60 * 24 * 30}"
        return self.responder(200, {"nome": nome}, {"Set-Cookie": biscoito})

    def sair(self):
        tok = self.token()
        if tok:
            with trava, conectar() as con:
                con.execute("DELETE FROM sessoes WHERE token = ?", (tok,))
        return self.responder(200, {"ok": True}, {"Set-Cookie": f"{COOKIE}=; Path=/; Max-Age=0"})

    def listar(self, q):
        def param(nome):
            return (q.get(nome) or [""])[0].strip()

        filtros, valores = [], []

        de, ate = param("de"), param("ate")
        for valor, sinal in ((de, ">="), (ate, "<=")):
            if valor:
                try:
                    date.fromisoformat(valor)
                except ValueError:
                    return self.responder(400, {"erro": "Data do filtro inválida."})
                filtros.append(f"data {sinal} ?")
                valores.append(valor)

        busca = param("busca")
        if busca:
            digitos = re.sub(r"\D", "", busca)
            cond = "cliente LIKE ? COLLATE NOCASE"
            valores.append(f"%{busca}%")
            if digitos:
                cond += (" OR REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(telefone,"
                         "'(',''),')',''),'-',''),' ',''),'+','') LIKE ?")
                valores.append(f"%{digitos}%")
            filtros.append(f"({cond})")

        jac = param("jacuzzi")
        if jac in ("sim", "nao"):
            filtros.append("jacuzzi = ?")
            valores.append(1 if jac == "sim" else 0)

        por = param("por")
        if por:
            filtros.append("registrado_por = ?")
            valores.append(por)

        sql = "SELECT * FROM reservas"
        if filtros:
            sql += " WHERE " + " AND ".join(filtros)
        sql += " ORDER BY data, cliente COLLATE NOCASE"

        with conectar() as con:
            linhas = [como_dict(l) for l in con.execute(sql, valores)]
            equipe = [l[0] for l in con.execute(
                "SELECT DISTINCT registrado_por FROM reservas ORDER BY registrado_por COLLATE NOCASE")]
        return self.responder(200, {"reservas": linhas, "equipe": equipe})


def main():
    preparar_banco()
    servidor = ThreadingHTTPServer(("0.0.0.0", PORTA), Handler)
    print(f"Reservas Miramar rodando em http://localhost:{PORTA}")
    if not SENHA:
        print("Aviso: sem MIRAMAR_SENHA definida, qualquer pessoa na rede consegue entrar só com o nome.")
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nAté mais!")


if __name__ == "__main__":
    main()
