# Reservas — Restaurante Miramar

Sistema simples de reservas para a equipe do Miramar. Abre no navegador
(computador, tablet ou celular) e guarda tudo num arquivo só, `reservas.db`.

## O que ele faz

- **Nova reserva**: cliente, data, quantidade de pessoas, telefone,
  preferência de local (campo livre de anotação) e se a jacuzzi está incluída.
  Nenhum campo pode ficar em branco.
- **Quem registrou**: quem abre o sistema coloca o próprio nome. Toda reserva
  mostra quem registrou e quando. Se alguém alterar depois, aparece também.
- **Lista com filtros**: por data (hoje, amanhã, fim de semana, próximos 7
  dias, este mês ou um período de/até), por nome ou telefone do cliente,
  com ou sem jacuzzi e por quem registrou. A lista vem separada por dia, com
  o total de reservas e de pessoas.
- Editar e apagar reservas, botão de WhatsApp para falar com o cliente
  e lista pronta para imprimir (Ctrl+P).

## Como usar

Precisa só do [Python 3](https://www.python.org/downloads/) (versão 3.9 ou mais nova).
Não tem nada para instalar além disso.

```bash
python3 servidor.py
```

No Windows, pode ser `python servidor.py`.

Depois é só abrir **http://localhost:8000** no navegador.

Para usar em outros aparelhos na mesma rede Wi-Fi, abra
`http://IP-DO-COMPUTADOR:8000` (o IP aparece em Configurações de rede do
computador onde o sistema está rodando).

### Senha da equipe (recomendado)

Sem senha, qualquer um na rede consegue entrar só digitando um nome. Para pedir
uma senha na entrada:

```bash
MIRAMAR_SENHA=suasenha python3 servidor.py
```

No Windows (PowerShell):

```powershell
$env:MIRAMAR_SENHA="suasenha"; python servidor.py
```

Outra opção é `MIRAMAR_PORTA` para trocar a porta (padrão 8000).

## Colocar na internet (Railway)

Para a equipe acessar de qualquer lugar:

1. Crie uma conta em https://railway.com entrando com o GitHub.
2. **New Project → Deploy from GitHub repo** e escolha `formul-riomiramar`.
3. No serviço criado, em **Variables**, adicione:
   - `MIRAMAR_SENHA` = a senha da equipe
   - `MIRAMAR_BANCO` = `/data/reservas.db`
4. Clique com o botão direito no serviço → **Attach Volume** e use `/data` como caminho.
   Sem isso, as reservas se perdem toda vez que o sistema reinicia.
5. Em **Settings → Networking → Generate Domain**. O endereço gerado é o que a equipe vai usar.

O sistema já lê a porta que o Railway define (`PORT`), então não precisa de mais nada.

## Backup

Todas as reservas ficam no arquivo `reservas.db`, na mesma pasta do sistema.
Copie esse arquivo de vez em quando para um lugar seguro (pendrive, Google
Drive etc.).
