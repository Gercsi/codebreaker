# CodeBreaker – Kódtörő párbaj

Magyar nyelvű, kétjátékos Mastermind-párbaj. Privát szobák, szinkronizált körök, szerveroldali értékelés, böngészőfrissítés utáni visszaállítás és kölcsönösen elfogadott visszavágó.

## Indítás Windows / XAMPP alatt

Előfeltétel: Node.js 18.18+ és npm. A fejlesztés a gépen telepített Node 18.20.7-tel kompatibilis; új éles telepítéshez Node 22 vagy újabb támogatott LTS kiadás ajánlott. PHP és MySQL a játékhoz nem szükséges.

```powershell
cd C:\xampp\htdocs\CodeBreaker
npm ci
Copy-Item .env.example .env
npm run build
npm start
```

Megnyitás: **http://localhost:3001**. Egyszerű helyi indításhoz futtatható a `start-codebreaker.cmd` is. A Node-folyamatnak a játék közben futnia kell.

XAMPP Apache mellett a **http://localhost/CodeBreaker/** belépő átirányít a Node-szerverre. A `.htaccess` letiltja a források, az adatbázis, a függőségek és a környezeti fájlok Apache-on keresztüli letöltését. Ehhez Apache 2.4 és a könyvtárban engedélyezett `.htaccess` (`AllowOverride All`) szükséges. Ha saját Apache-konfigurációt használsz, ellenőrizd, hogy például a `/CodeBreaker/data/codebreaker.sqlite` és a `/CodeBreaker/.env` URL 403 választ ad; a teljes projektkönyvtárat ne tedd publikus dokumentumgyökérré ilyen védelem nélkül. A Node statikusan kizárólag a `dist/client` könyvtárat szolgálja ki.

Két eszköz azonos hálózaton: nyisd meg a kiszolgáló gép IP-címét, például `http://192.168.1.20:3001`, és engedélyezd a 3001/TCP portot a Windows tűzfalban a megfelelő privát hálózaton. Azonos eredetű kapcsolatok engedélyezettek. Internetes használathoz HTTPS reverse proxy szükséges; lásd alább.

## Fejlesztés és ellenőrzés

```powershell
npm run dev
# React: http://localhost:5173, Socket.IO/API proxy: localhost:3001
npm test
npm run build
npm run test:e2e
```

Az E2E-csomag helyben a telepített Microsoft Edge-et használja. Chrome-hoz PowerShellben: `$env:PLAYWRIGHT_CHANNEL='chrome'`. Linux CI-ben telepítsd a Chromiumot (`npx playwright install --with-deps chromium`), majd állítsd a `PLAYWRIGHT_CHANNEL` változót `chromium` értékre. Az E2E külön szervert indít a 3101-es porton, külön adatbázissal. Előtte build szükséges. A 3101-es port legyen szabad.

## Funkciók

- Maximum két játékos, 20 karakteres becenév, kriptográfiailag véletlen hatkarakteres szobakód, meghívólink.
- Könnyű (4/6), normál (5/8), nehéz (6/8) fokozat; színismétlés kapcsolható; 5/8/10/12/15/20 próbálkozás a felületen. A motor 1–20 próbálkozást támogat.
- Zárolt titkos kódok, azonnali saját értékelés, szinkronizált körök. Az ellenfél csak jelenléti és beküldési státuszt lát.
- Azonos körben történő megfejtés döntetlen. Egy megfejtés győzelem; a tippkeret kétoldali kimerítése döntetlen.
- 120 másodperces visszacsatlakozás, állapotmentés SQLite-ba, szerver-újraindítás utáni helyreállítás. Aktív játékban kapcsolatvesztéskor a tippelés szünetel. A határidő után feladás; ha egyik játékos sincs jelen, döntetlen.
- Kilépés játék közben azonnali feladás. Várakozó szobában a házigazdai szerep átadható a megmaradt játékosnak.
- Végén mindkét kód és tippelőzmény látható; a visszavágóhoz mindkét játékos beleegyezése és új kódja kell.
- Sötét, reszponzív felület, billentyűzetes fókuszok, színnevek és kikapcsolható szimbólumok, csökkentett mozgás támogatása.

## Architektúra és adatbiztonság

React 19 + TypeScript + Vite 6 és Tailwind CSS 3; Node.js + Express + Socket.IO 4; SQLite a `sql.js` WebAssembly-kiadásával. A `sql.js` elkerüli a platformfüggő natív modulfordítást, így a meglévő Windows/Node 18 környezetben is használható.

`server/scoring.ts`: tiszta, duplikációhelyes értékelő. `server/engine.ts`: autoritatív állapotgép. `server/app.ts`: tagságellenőrzés, Socket.IO, rate limit és játékosonkénti állapotküldés. `server/store.ts`: SQLite tárolás. `shared/protocol.ts`: esemény-payloadok és a kliensnek megengedett állapottípusok. `src/main.tsx`: magyar kezelőfelület.

Állapotgép: `WAITING → SETUP → PLAYING → FINISHED`; visszavágó: `FINISHED → SETUP` új játékazonosítóval. Lejárt vagy kiürült szoba: `CLOSED`. Induláskor zárolódik a konfiguráció. Minden tipp tartalmazza a játékazonosítót és a körszámot, ezért késleltetett vagy újraküldött kérés nem válhat másik kör tippjévé.

Az eseménykezelők szinkron állapotátmeneteket alkalmaznak; a második, párhuzamosan érkező tippet már a módosított állapot alapján utasítják el. A módosítás másolaton történik, és csak sikeres mentés után válik hitelessé. A SQLite `rooms` tábla verziófüggetlen JSON állapotot tárol; a `results` tábla játékazonosítónként egyszer ment eredmény-összesítést. Minden változtatás után a teljes SQLite-fájl ideiglenes fájlba íródik, majd atomikus átnevezéssel cserélődik. Egyetlen szerverfolyamat használhat egy adatfájlt. Ez kisebb MVP-forgalomra készült, nagyobb terhelésnél natív SQLite/WAL vagy PostgreSQL adapterre kell váltani; több példány/cluster nem támogatott. A szobák legfeljebb 24 óráig élnek, egyszerre maximum 500 tárolható; az eredményrekordok megmaradnak.

A kliens csak a saját titkát és tippjeit kapja meg; az ellenfél részletes adatai kizárólag `FINISHED` állapotban szerepelnek a `reveal` mezőben. A szerver saját whitelistből építi a publikus állapotot. A munkamenet 256 bites véletlen tokennel hitelesít, amelynek csak SHA-256 hash-e kerül az adatbázisba. A böngésző `sessionStorage`-ot használ: frissítés után ugyanabban a fülben visszatérhetsz, két külön fül pedig külön játékos lehet. Bezárt fül vagy törölt böngészőadat után a token nem állítható vissza. A titkos kódokat a szervernek olvasnia kell az értékeléshez; az adatbázis lemeztitkosítása nincs az MVP-ben. Védd az adatkönyvtárhoz való hozzáférést.

Rate limit: socketenként 120 esemény/perc, hálózati címként 600 esemény/perc, 15 szobalétrehozás/perc, 30 csatlakozási próbálkozás/perc és 100 új kapcsolat/perc. Maximum Socket.IO-üzenet: 4 KB. Reverse proxy mögött szándékosan nem bízunk meg automatikusan az `X-Forwarded-For` fejlécben: az IP-limit a proxy címére összesítődhet; nagyobb nyilvános forgalomnál a proxynál külön IP-limitet kell beállítani. A csomag nem használ külső fiókot, analitikát, távoli betűkészletet vagy felhőszolgáltatást.

## Események

Minden kliensművelet acknowledgement választ kap: `{ok:true,session?}` vagy `{ok:false,error}`. A szerver változáskor külön `room:state` nézetet küld minden játékosnak.

| Kliens → szerver | Payload |
| --- | --- |
| `room:create` | `{nickname}` |
| `room:join` | `{nickname,code}` |
| `room:leave`, `game:start`, `game:rematch-request` | `{}` |
| `game:configure` | `{difficulty,repeats,maxAttempts}` |
| `game:secret-submit` | `{gameId,colors:number[]}` |
| `game:guess-submit` | `{gameId,round,colors:number[]}` |
| `game:state-sync` | `{roomCode,playerId,token}` |

További szerveres események: `game:ready`, `game:guess-result` (csak a beküldőnek), `game:round-complete`, `game:finished`, `game:rematch-accepted`, `player:disconnected`, `player:reconnected`. Az események teljes TypeScript-szerződése a `shared/protocol.ts` fájlban található. A helyreállítás saját hitelesített állapotszinkronnal történik, nem a Socket.IO átmeneti memóriájára támaszkodva. Socket.IO konfiguráció: [hivatalos dokumentáció](https://socket.io/docs/v4/server-options/).

## Környezeti változók

| Változó | Alapérték | Jelentés |
| --- | --- | --- |
| `PORT` | `3001` | Node HTTP/Socket.IO port |
| `HOST` | `0.0.0.0` | Figyelési cím |
| `DATABASE_PATH` | `./data/codebreaker.sqlite` | SQLite-fájl |
| `ALLOWED_ORIGINS` | localhost:5173 és localhost:3001 teljes originje | Vesszővel elválasztott további böngészőeredetek; same-origin mindig engedélyezett |
| `RECONNECT_SECONDS` | `120` | Visszatérési türelmi idő |
| `ROOM_TTL_HOURS` | `24` | Szobák élettartama |

## Linux VPS, Docker, HTTPS/WSS

```sh
cp .env.example .env
# ALLOWED_ORIGINS=https://play.example.com
docker compose up -d --build
docker compose logs -f
```

A Docker Node 22-t, nem root felhasználót és állandó `codebreaker-data` volume-ot használ. A Node portja alapértelmezetten csak a VPS loopback címén érhető el. Másold a `deploy/nginx.conf` mintát az Nginx konfigurációjába, cseréld a domaint és az érvényes TLS-tanúsítvány útvonalait, majd `nginx -t` és reload. A tanúsítvány beszerzése/megújítása a VPS üzemeltetőjének feladata. Az Nginx továbbítja a WebSocket Upgrade és Host fejléceket. HTTPS oldalról a Socket.IO automatikusan WSS-t használ. Egészségellenőrzés: `/api/health`.

Frissítés: készíts adatmentést, másold be az új forrást, majd `docker compose up -d --build`. Ne használd a `docker compose down -v` parancsot, ha meg akarod őrizni az adatokat. Az adatbázist leállított alkalmazás mellett mentsd. Leállítás után a játékosok a következő indulástól kapnak türelmi időt, ha a leállás előtt online voltak; az eleve offline játékosok meglévő határideje megmarad. Áramszünet elleni teljes tartóssági garancia vagy többgépes replikáció nincs.

## Tudatos MVP-határok

Nincs regisztráció, ranglista, best-of sorozat, időkorlátos mód vagy SHA-256 kódcommitment. Az eredmények adatbázisban megmaradnak, de nincs külön statisztikai felület. A kétjátékos alapjáték ezek nélkül teljes. A Docker/Nginx konfiguráció helyi build- és E2E-ellenőrzése mellett a tényleges VPS-es TLS-telepítést külön kell elvégezni.
