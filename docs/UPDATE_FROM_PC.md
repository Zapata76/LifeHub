# Aggiornamenti Life Hub dal PC via FTPS

Questa procedura pubblica frontend e backend su Aruba. È distinta dall'auto-update
della PWA, che continua a controllare `ngsw.json` e ad aggiornare i dispositivi.
Il protocollo è adattato da Align Garden alla struttura, ai percorsi e alla
configurazione di Life Hub. Non richiede SSH, Python, Node o Composer sull'hosting.

## Comandi

Dalla radice del repository, con Python 3.10+, Node compatibile con Angular,
PHP `C:/tools/php859/php.exe` e Composer disponibili:

```powershell
./update.ps1 -PrepareOnly      # Build e controlli locali, nessun accesso all'hosting
./update.ps1 -CheckConnection # FTPS, certificato, destinazione e presenza del puntatore; sola lettura
./update.ps1                  # Build, upload verificato, attivazione e controlli online
./update.ps1 -VerifyLibraries # Rilettura completa SHA256 delle librerie della release attiva
./update.ps1 -Rollback        # Ripristina la release precedente e ne verifica il funzionamento
```

Le quattro opzioni di modalità sono mutuamente esclusive. `-TlsHost` può essere
aggiunto per specificare il nome TLS confermato dal provider. I comandi di upload,
setup e rollback **scrivono sul sito di produzione**: non sono simulazioni.

Composer viene cercato in `LIFEHUB_COMPOSER_PHAR`, `.local/tools/composer.phar`,
accanto al PHP configurato, poi accanto al comando Composer nel PATH. Non viene
scaricato automaticamente. `npm ci` e `composer install` possono accedere ai
rispettivi registry; usano i lock file e Composer non esegue script o plugin.
Il vendor di sviluppo `api/vendor` non viene modificato.

## Impostazioni del PC

Creare `.local/deploy.json` (ignorato da Git), ad esempio:

```json
{
  "filezilla_sites": "C:/Users/NOME/AppData/Roaming/FileZilla/sitemanager.xml",
  "tls_host": "ftplnx02.aruba.it"
}
```

Confermare il nome TLS con il provider; non disabilitare la verifica certificati.
Senza file, viene usato `%APPDATA%/FileZilla/sitemanager.xml` e il nome del profilo
FTP come host TLS. Il profilo FileZilla deve avere nome `em`, host
`ftp.emilianomaugeri.it`, login normale e password Base64 salvata. Master password,
profili duplicati o protocolli diversi non sono supportati. Le credenziali non
vengono stampate, copiate nelle release o inserite nel JSON.

Destinazioni intenzionalmente fisse nel codice:

- FTPS: `/www.emilianomaugeri.it/umbertini`
- URL: `https://www.emilianomaugeri.it/umbertini/`
- base frontend e API: `/umbertini`

Non cambiare solo l'URL: front controller, regole Apache, build, PWA e test devono
essere adattati insieme per un'altra destinazione.

## Prima predisposizione: attenzione al sito esistente

Il sito attuale, pubblicato con `ops/build-release.ps1`, usa un layout diverso.
**Non eseguire il setup sopra il sito attivo aspettandosi una conversione
automatica.** Il setup rifiuta `index.html` o `index.php` esistenti; il publisher
rifiuta entry point e `.htaccess` non gestiti. Nessun contenuto esistente viene
automaticamente cancellato, spostato o adottato.

La prima conversione richiede una finestra di manutenzione e questi passaggi
manuali, da eseguire solo dopo aver conservato una copia recuperabile del sito:

1. Fare backup di sito, configurazione, DB e intera cartella `uploads`, inclusa
   `push-vapid.php`. Conservare il backup fuori dal document root. Eseguire prima
   `-PrepareOnly` e i test per verificare il PC.
2. Mettere il sito in manutenzione e conservare fuori dalla directory pubblica
   il vecchio `index.html` (ed eventuale `index.php`) e il vecchio `.htaccess`.
   Non toccare DB, configurazione e upload originali. Per ripristinare il layout
   precedente serviranno esattamente questi file e il vecchio codice.
3. Configurare `.local/deploy.json`, poi eseguire:

   ```powershell
   python ops/setup_hosting.py
   ```

   Il setup crea le directory protette, verifica HTTP **403 con un file reale**,
   installa il puntatore `hosting.php` e le regole Apache. Non carica credenziali.
   Le regole richiedono Apache 2.4, mod_rewrite e autorizzazione a usare `.htaccess`.
4. Dopo il PASS, compilare e caricare manualmente `.lh-private/config.php` usando
   `deploy/updater/config.php.example`. Riprendere tutti i valori reali dal vecchio
   file, compresi `sessionName`, `jobToken`, mittente email e `pushVapidSubject`.
   Il nuovo `storagePath` è `__DIR__ . '/storage'`.
5. Copiare **il contenuto** di `uploads` dentro `.lh-private/storage`, mantenendo
   nomi e struttura (`storage/files/...`, `storage/push-vapid.php`). Non rigenerare
   la chiave VAPID, altrimenti le sottoscrizioni push esistenti non saranno valide.
   Verificare quantità e integrità dei file e mantenere gli originali finché la
   conversione non è stata verificata. `storage` deve essere scrivibile da PHP.
6. Eseguire `./update.ps1`, attendere `published` e provare login, allegati,
   anteprime PDF, push e job email. URL e cookie path restano gli stessi; viene
   conservata la directory sessioni configurata nel PHP dell'hosting.

La prima installazione non ha una release precedente gestita: se fallisce dopo
l'attivazione, viene rimosso solo il nuovo entry point e restano le protezioni.
Il vecchio layout si recupera manualmente ripristinando i file conservati al
punto 2. Dai successivi aggiornamenti il rollback è automatico e disponibile
anche con `-Rollback`. Il rollback non annulla eventuali modifiche ai dati fatte
dagli utenti durante il periodo in cui la nuova release era attiva.

Non alternare più `ops/build-release.ps1`/upload manuale e questo updater sulla
stessa installazione: il vecchio pacchetto sovrascriverebbe le nuove regole.
Lo script precedente rimane disponibile per installazioni ancora nel layout
tradizionale; non è stato modificato.

## Cosa succede a ogni aggiornamento

1. Verifica FTPS e destinazione senza cambiare il sito; chiude la connessione.
2. Esegue build e lint, prepara `.local/releases/<id>` senza configurazioni,
   upload, SQL, test o dipendenze di sviluppo. Controlla gli hash di `ngsw.json`
   contro gli effettivi byte degli asset.
3. Acquisisce `.lh-update-lock`, senza takeover di lock esistenti, e verifica
   entry point, regole e protezioni HTTP. Carica file in nomi temporanei, rilegge
   SHA256 e rinomina solo i file verificati. Riprova gli errori temporanei.
4. Riutilizza le librerie immutabili in `.lh-releases/_libraries/<hash>` quando il
   loro manifest corrisponde; altrimenti carica e verifica un nuovo pacchetto.
   Un bridge PSR-4 lega ciascuna release al proprio pacchetto e ai propri sorgenti.
5. Carica `.lh-releases/<id>`, salva i byte dell'entry point precedente anche in
   `.local/deployments/<id>`, poi sostituisce il solo `index.php` pubblico.
6. Verifica HTML, header `X-LifeHub-Release`, bootstrap API e DB. Il controllo
   `/api/deployment-health` esegue SELECT senza righe per verificare la presenza
   delle tabelle e colonne richieste dal codice, senza leggere dati applicativi.
   Non controlla tipi, indici, vincoli o qualità dei dati e **non applica SQL**.
7. Se i controlli falliscono, tenta il ripristino dei byte dell'entry point
   precedente. Un errore di rete può impedire anche il rollback: in quel caso
   segnala esplicitamente il recupero manuale necessario, senza dichiarare PASS.

`prepared` e `uploaded` non significano sito aggiornato: il successo è `published`.
I log riportano fasi, conteggi e codici, non password o risposte FTP grezze.
L'entry point e i manifest PWA non vengono messi in cache HTTP. Gli asset della
release immediatamente precedente rimangono disponibili per i vecchi lazy chunk;
i client più vecchi di una release possono comunque richiedere un aggiornamento.
Non è una transazione distribuita tra richieste HTTP già in corso e backend.

Le vecchie release e i pacchetti librerie **non vengono cancellati automaticamente**.
Prima di una pulizia manuale controllare release attiva, precedente, giornali e
riferimenti ai pacchetti. Un lock rimasto dopo un arresto va investigato; rimuoverlo
manualmente soltanto dopo aver escluso che un altro aggiornamento sia in corso.

Gli eventuali cambiamenti DB restano una procedura separata: nessuna migrazione
automatica, modifica a MyISAM o esecuzione di `database/lifehub.sql` in produzione.
Il file SQL viene soltanto letto sul PC per estrarre il contratto tabelle/colonne.

## Verifica locale

```powershell
python -m unittest discover -s ops/tests -p 'test_*.py'
./update.ps1 -PrepareOnly
```

I test simulano FTPS e gli errori di pubblicazione senza contattare Aruba; i test
del front controller avviano PHP solo su localhost e usano configurazioni sintetiche.
La protezione Apache e il comportamento FTPS reale devono essere verificati
sull'hosting tramite il setup e i controlli di pubblicazione.
