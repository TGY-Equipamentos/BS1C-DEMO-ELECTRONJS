# BS1C • Demo ElectronJS (Serial Bluetooth / SPP)

Este projeto é uma aplicação em **ElectronJS** para:

- selecionar uma **porta serial Bluetooth** (SPP / Bluetooth 2.0 “clássico”, típico de HC-05/BS1C)
- conectar
- enviar uma mensagem de teste
- **escutar por um período** (padrão: **1000ms**) e exibir a resposta na tela

Referência do produto e parâmetros padrão (ex.: PIN `1234`):  
`https://www.tgycyber.com/en/docs/bs1c`

## Pré-requisitos

- Node.js + npm
- Parear o BS1C no sistema operacional
  - **macOS**: após parear, normalmente aparece uma porta tipo `/dev/cu.*` ou `/dev/tty.*`
  - **Windows**: normalmente aparece uma `COMx`

## Como rodar

```bash
npm install --cache ./.npm-cache --no-audit --no-fund
npm start
```

## Uso rápido

1. Clique **Atualizar** para listar as portas.
2. Selecione a porta do BS1C (no macOS, prefira `/dev/cu.*`).
3. Clique **Conectar**.
4. Digite a mensagem e clique **Enviar e escutar**.
5. A resposta capturada (no intervalo configurado) aparece em **Resposta (capturada)** e os eventos em **Log**.
