# Life Hub

## Struttura

- `api/`: API modulare PHP 7.4.33, CLI e test.
- `database/lifehub.sql`: schema completo MySQL 5.0/MyISAM.
- `web/`: PWA Angular.
- `ops/`: build, server locale, backup, ripristino e gate di rilascio.
- `deploy/`: regole Apache e protezione dello storage privato.
- `tools/`: wrapper per PHP 7.4.33 e Composer.
- `docs/`: specifica funzionale, architettura, database e operazioni.

## Requisiti locali

Il runtime PHP autorevole è:

```text
C:\tools\php7433\php.exe
```

Sono inoltre necessari MySQL, Composer e Node.js/npm.

## Configurazione

Copiare `api/config/app.example.php` in `api/config/app.php`, che è escluso da
Git, e configurare database, titolo applicazione, sessione, storage e log.
L'applicazione non usa file `.env` né variabili del web server.

Installare le dipendenze bloccate:

```powershell
.\tools\composer.ps1 install --working-dir=api
Set-Location web
npm ci
Set-Location ..
```

## Prima installazione

Creare un database vuoto con charset UTF-8 e configurarlo in
`api/config/app.php`. Dalla directory principale del repository verificare e
applicare lo schema:

```powershell
.\tools\php7433.ps1 .\api\bin\lifehub db:init:dry-run .\api\config\app.php
.\tools\php7433.ps1 .\api\bin\lifehub db:init .\api\config\app.php
```

`db:init` applica la baseline soltanto a un database vuoto e rifiuta database
che contengono già tabelle `lh_`.

Creare quindi il primo nucleo familiare, il primo amministratore e la lista
della spesa primaria:

```powershell
.\tools\php7433.ps1 .\api\bin\lifehub admin:create `
  .\api\config\app.php `
  "Amministratore" `
  "PASSWORD-DI-ALMENO-12-CARATTERI" `
  "Famiglia" `
  "Europe/Rome"
```

La password è un argomento del processo: eseguire il comando in un terminale
privato, rimuoverlo dalla cronologia e cambiarla dall'interfaccia dopo il primo
accesso.

Verificare l'installazione:

```powershell
.\tools\php7433.ps1 .\api\bin\lifehub db:inspect .\api\config\app.php
.\tools\php7433.ps1 .\api\bin\lifehub integrity .\api\config\app.php
```

## Qualità

```powershell
.\ops\release-readiness.ps1
.\ops\release-readiness.ps1 -WithDatabaseIntegration
```

La variante con database crea e rimuove soltanto schemi temporanei con prefisso
`lh_probe_`.

## Build e server locale

```powershell
.\ops\build-release.ps1
.\ops\serve-local.ps1
```

Aprire `http://127.0.0.1:8080/umbertini/`.

La build viene generata nella directory ignorata `.release/umbertini`. Lo
storage applicativo è `/umbertini/uploads`; i blob privati sono salvati in
`/umbertini/uploads/files` e i log in `/umbertini/uploads/logs`.

Per il deploy completo seguire [DEPLOY_PRODUZIONE.txt](DEPLOY_PRODUZIONE.txt).
La documentazione progettuale è indicizzata in [docs/README.md](docs/README.md).

## Licenza

Life Hub è software libero e open source distribuito secondo i termini della
[GNU Affero General Public License v3.0](LICENSE).
