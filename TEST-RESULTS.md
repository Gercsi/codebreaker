# Ellenőrzési jegyzőkönyv

Dátum: 2026. október 15. Környezet: Windows, Node.js 18.20.7, npm 10.8.2, telepített Microsoft Edge headless böngésző.

## Sikeres ellenőrzések

- `npm run build`: TypeScript strict ellenőrzés, Vite 6.4.4 frontend production build, Node backend fordítás. Sikeres.
- `npm test`: **13/13 sikeres teszt**, 0 hiba. A 3 színű, 4 pozíciós kódok összes **6561 kódpárja** kimerítően ellenőrizve.
- `npm run test:e2e`: **3/3 sikeres Playwright teszt**, 0 hiba, két független böngészőkörnyezettel.
- PHP XAMPP-belépő szintaktikai ellenőrzése: sikeres.
- Telepített alkalmazás: `http://localhost:3001/` HTTP 200, `/api/health` `{ok:true}`.
- XAMPP Apache külön QA-konfigurációval, csak helyi 3102-es porton: `/CodeBreaker/` és `/CodeBreaker/index.php` HTTP 302, átirányítás a Node-alkalmazásra. A `package.json`, `server/engine.ts`, `data/codebreaker.sqlite` és `.env.example` közvetlen lekérése HTTP 403. Könyvtárlista nem hozzáférhető. Az ideiglenes Apache-példány a vizsgálat után leállítva; a meglévő Apache-konfiguráció nem változott.
- Asztali és mobil képernyőképek szemrevételezve. Mobil szélességek: 375 és 414 CSS-pixel; főmenü, szabályok, nehéz pálya és eredményképernyő. Nincs dokumentumszintű vízszintes túllógás.

## A 13 motor-/integrációs teszt tartalma

1. Pontos, részleges, nulla és duplikált találatok, a specifikáció példáival.
2. Hibás hossz, adattípus, színazonosító, tört/negatív érték és tiltott ismétlés.
3. Kimerítő találatszám-/szimmetriaellenőrzés 6561 kódpárra.
4. Kétfős szobakapacitás, jogosultságok, konfigurációzár és hamis munkamenettoken.
5. Körszinkronizáció, második tipp tiltása, azonos körben megfejtés = döntetlen.
6. Egyoldali megfejtés = győzelem; előtte nincs ellenfél-kód, -tipp vagy hitelesítő adat a nézetben.
7. Maximumkörös döntetlen és kölcsönösen elfogadott, teljesen új állapotú visszavágó.
8. Játékosonként külön visszajelzés, körváltás és régi körre küldött tipp elutasítása.
9. Megszakítás, hiteles visszacsatlakozás és határidő utáni feladás.
10. Mindkét játékos offline = döntetlen; várakozó szobában házigazdaátadás.
11. Titkos kód zárolása és önkéntes feladás.
12. Sikertelen lemezmentés nem változtatja meg a hiteles memóriabeli állapotot.
13. Valódi Socket.IO-kapcsolatok, harmadik kliens kizárása, hamis token, két párhuzamos tippből egy elfogadása, saját állapot visszaállítása, SQLite-ból szerver-újraindítás és azonos végeredmény mindkét kliensen.

## A 3 E2E teszt tartalma

1. Szobakód létrehozása → vendég csatlakozása → két kód rögzítése → saját találat azonnal, ellenfél előtt rejtve → oldalfrissítés → döntetlen mindkét kliensen → elfogadott visszavágó új kódpozíciókkal.
2. Mobil főmenü, játékszabályok párbeszédablak, nehézségállítás, túlcsordulásellenőrzés.
3. Mobil + desktop párbaj nehéz fokozaton, ismétlés tiltásával; hatpozíciós kódok, helyes győzelem/vereség mindkét képernyőn, mobil eredménytábla túlcsordulás nélkül; JavaScript oldalhiba nem jelentkezett.

## Ellenőrzési határok

Docker CLI nem áll rendelkezésre, ezért a konténerbuild és a Compose indítása nincs helyben futtatva. A VPS-es Nginx/TLS telepítés és két fizikailag külön hálózati eszköz próbája nincs elvégezve. Az automatizált többjátékos tesztek külön böngészőkörnyezetekkel, valamint külön valós Socket.IO-kliensekkel futottak. A működés egyetlen Node-folyamatra készült; többpéldányos működés és nagy terhelés mérése nem része az MVP-nek.
