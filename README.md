# VFX Lab

Aplicație Three.js cu 14 efecte vizuale, o horă interactivă ancorată de reperul Hiro și un efect AR declanșat de o fotografie cu cafea.

## Pornire

```sh
npm ci
npm run dev
```

Deschide adresa afișată în terminal. Pentru compilare: `npm run build`.

## Publicare

În depozitul GitHub, directorul `source/` conține proiectul editabil: `src`, `public`, `tests`, paginile HTML și configurația Vite. Fișierele din rădăcina depozitului reprezintă site-ul publicat. Pentru pornire după clonare, intră în `source/` înainte de comenzile de mai sus.

`npm run build` pregătește aplicația în `dist`. Adresele sunt relative și funcționează într-un subdirector GitHub Pages. Verifică rezultatul cu `npm run preview`.

Publicarea pe HTTPS permite deschiderea aplicației pe telefon și utilizarea camerei în modul AR.

Proiectul de găzduire: https://github.com/Vladika-sys/vfx-lab

Adresa GitHub Pages: https://vladika-sys.github.io/vfx-lab/

Pentru actualizări, salvează sursa în `source/`, rulează compilarea și copiază conținutul `source/dist/` în rădăcina depozitului, fără să ștergi `source/`. GitHub Pages folosește ramura `main`, directorul `/ (root)`. Publicarea se termină în fila Actions; modificările din sursă nu actualizează singure site-ul.

## Realitate augmentată

### Efect declanșat de imagine — fotografia cu cafea

`cafea.html` folosește recunoașterea unei imagini naturale prin MindAR 1.2.5, fără reperul Hiro. Imaginea-țintă este fotografia furnizată de utilizator, păstrată integral în `public/assets/target/coffe.jpg`, la 1200×798 px. Poate fi tipărită pe hârtie mată sau afișată pe un al doilea ecran. Este recunoscută această fotografie, nu orice ceașcă fizică sau fotografie cu cafea. Vechea adresă `target.html` redirecționează către pagina nouă.

1. Deschide `cafea.html` pe telefon, prin HTTPS, în Safari sau Chrome. Poți ajunge aici și din pagina horei, prin legătura „Cafea AR”.
2. Descarcă imaginea, apoi apasă „Pornește camera” și permite accesul la camera din spate. Nu este solicitat microfonul.
3. Încadrează fotografia întreagă, bine luminată, fără reflexii. Apare o ceașcă tridimensională cu farfurioară, abur și boabe care se rotesc în jurul ei. Animația este ancorată de fotografie: deplasarea sau înclinarea acesteia schimbă poziția și perspectiva scenei.
4. Atingerea ceștii sau a boabelor produce un impuls de mișcare. Bara de jos permite pauză, reglarea mărimii și oprirea sunetului. La pierderea fotografiei, scena dispare și muzica se oprește; la recunoaștere, efectul reapare. Închiderea sau ascunderea paginii oprește camera și eliberează sesiunea.

Ceașca este construită din geometrie de revoluție, toruri și discuri Three.js; boabele au traiectorii circulare la înălțimi diferite. Aburul este un sistem de particule transparente. Fundalul sonor este o melodie instrumentală generată local prin Web Audio, din oscilatoare sinusoidale și triunghiulare; nu este o înregistrare descărcată. Apăsarea inițială pe „Pornește camera” deblochează redarea, iar muzica rămâne activă numai cât timp fotografia este recunoscută și efectul nu este în pauză.

Imaginea este analizată local, pe o copie de maximum 640 px. Poziția estimată de MindAR actualizează matricea grupului Three.js, iar proiecția camerei virtuale este adaptată imaginii video. Camera și suprafața 3D sunt decupate identic la redimensionarea ecranului. Nu se încarcă fotografii pe server. Prima deschidere descarcă modulul de recunoaștere; performanța și stabilitatea depind de telefon, lumină și mărimea fotografiei în cadru. Nu există ascundere automată în spatele obiectelor reale sau reconstrucție a încăperii.

Pentru înlocuire, salvează noua imagine în `public/assets/target/coffe.jpg`, apoi rulează `npm run target:compile` și `npm run build`. Compilatorul păstrează proporțiile originale, extrage punctele caracteristice și generează `public/assets/target/cafea.mind`; acesta trebuie publicat împreună cu noua imagine. Nu schimba numai fotografia fără recompilarea țintei. Vechea etichetă ilustrată a fost eliminată din site; poate fi recuperată din istoricul Git.

`src/image-tracking.js` integrează nucleul MindAR cu Three.js, `src/coffee-effect.js` construiește și animă scena, `src/target-sound.js` produce sunetul, iar `src/target.js` gestionează camera și comenzile. `npm test` include verificări pentru ancorare, anularea inițializării și pornirea/oprirea sunetului. Cu serverul local pornit, `/tests/image-tracking.html` verifică recunoașterea reală, deplasarea și pierderea imaginii în portret și peisaj. `/tests/target-session.html` verifică interfața cu o cameră simulată, inclusiv sunetul măsurat. Aceste probe nu înlocuiesc testarea camerei pe telefon.

Surse tehnice: [MindAR](https://github.com/hiukim/mind-ar-js), [documentația MindAR](https://hiukim.github.io/mind-ar-js-doc/), [Three.js](https://threejs.org/docs/), [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API). Textele licențelor MindAR și TensorFlow.js sunt în `public/licenses/`.

### Hora obiectelor

Modul AR pornește cu o horă demonstrativă de obiecte 3D. Dansatorii sunt grupuri și geometrii Three.js, plasate în coordonatele reperului Hiro. Transformarea lor este actualizată din poziția reperului în imaginea camerei; nu este un videoclip sau o animație lipită de ecran. Când reperul dispare, întregul grup dispare și ritmul se oprește. Rotirea telefonului schimbă perspectiva.

Butonul cu aparat foto capturează un cadru din camera activă. Poți alege și o fotografie din telefon, inclusiv înainte de pornirea AR. Atinge obiectul pentru decupare, ajustează cu „Păstrează” / „Elimină”, apoi apasă „Adaugă în horă”. Dacă recunoașterea automată nu este disponibilă, alege „Contur manual”, marchează puncte pe marginea obiectului și închide conturul. Fotografiile importate devin suprafețe texturate decupate, cu brațe și picioare 3D: personaje 2.5D, nu reconstrucții tridimensionale ale obiectelor fotografiate.

- Atingerile repetate ale aceluiași dansator alternează între o săritură, două bătăi din picior și un balans energic. După fiecare reacție, dansatorul revine la coregrafia grupului.
- Pauza oprește coregrafia, dar permite reacțiile la atingere.
- Coregrafia are patru secvențe de câte opt bătăi: mers lateral în cerc; doi pași spre centru cu brațele ridicate, apoi lărgirea cercului; atingeri cu călcâiul și piciorul întins, încheiate cu o săritură mică; schimbare de sens cu o undă de brațe și sărituri pe rând în jurul cercului. Succesiunea completă durează 32 de bătăi (aproximativ 17 secunde la 112 bătăi/minut), nu o rotație completă. Grupul continuă să înainteze între repetări, iar strângerea cercului este limitată în funcție de numărul de dansatori. Picioarele de sprijin rămân pe sol în coordonatele reperului, în afara săriturilor și reacțiilor. Mișcările sunt interpolate fără salturi de poziție, păstrând mâinile vecinilor unite. Scena și camera nu sunt rotite pentru a simula deplasarea.
- Reglajele schimbă ritmul (70–160 bătăi/minut) și numărul de dansatori (3–10).
- Pot fi folosite până la șase fotografii distincte; personajele sunt repetate când numărul de dansatori este mai mare. Eliminarea ultimului obiect revine la fotografiile rămase sau la demonstrație.
- Melodia este în `public/assets/ar/hora.m4a` și pornește la apăsarea butonului de muzică. Se repetă și se întrerupe când reperul nu este vizibil, dansul este oprit sau editorul este deschis; la reluare continuă din același loc. Reglajul de ritm schimbă și viteza redării, păstrând înălțimea sunetului unde browserul permite. Sincronizarea cu înregistrarea este aproximativă, iar coregrafia este stilizată. Autorul, titlul și licența înregistrării nu sunt documentate în proiect. Fișierul audio nu este inclus în licențele software sau CC0.
- Butonul de salvare descarcă o imagine PNG a camerei și a personajelor AR. Nu salvează un videoclip.

Decuparea automată folosește MediaPipe Tasks Vision 1.1.0 într-un worker separat, cu modelul MagicTouch de 512×512 (aproximativ 6 MB), prin API-ul `InteractiveSegmenterLegacy`. Accelerarea GPU este încercată prima, cu rezervă CPU dacă inițializarea sau prima inferență nu reușește. La pornirea AR / deschiderea editorului sunt pregătite modelul și operațiile grafice, iar același worker rămâne activ între fotografii. Analiza folosește o copie de maximum 512 px; textura fotografiei păstrează până la 1024 px. În timpul editorului, randarea scenei AR este suspendată pentru a nu concura cu decuparea.

La prima folosire se descarcă componentele WASM de pe jsDelivr și modelul de pe Google Cloud Storage, la versiuni fixate. Modelul este păstrat în Cache Storage când browserul permite; cache-ul nu conține fotografii. Prima încărcare depinde de conexiune, iar viteza de calcul depinde de dispozitiv. Fotografiile și cadrele video nu sunt trimise către aceste servicii. Conturul manual funcționează fără modelul extern. Obiectele decupate sunt păstrate doar în memoria sesiunii; reîncărcarea paginii le șterge. Dacă galeria trimite pagina în fundal, camera AR se oprește și trebuie repornită.

Modelul poate necesita corecții la contururi fine sau goluri, precum interiorul mânerului unei căni. „Păstrează” adaugă regiunea selectată la mască; „Elimină” scade regiunea învecinată de culoare apropiată punctului atins, fără o nouă inferență. Fundalurile foarte texturate pot necesita mai multe atingeri. Pentru contur exact, folosește alternativa manuală.

Surse: [MediaPipe Interactive Segmenter](https://developers.google.com/edge/mediapipe/solutions/vision/interactive_segmenter/web_js), [modelul MagicTouch 512](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MagicTouch.pdf), [exemplul oficial al modelului rapid](https://codepen.io/mediapipe-preview/pen/ZEqzpRg). Licența Apache 2.0 a MediaPipe este inclusă în `public/assets/ar/MEDIAPIPE_LICENSE.txt`.

`npm test` verifică pașii, ritmul, legătura dintre brațe, pauza și reacțiile la atingere. Cu serverul local pornit, `/tests/ar-tracking.html` verifică recunoașterea și pierderea reperului, iar `/tests/hora-preview.html` permite inspectarea celor patru secvențe. Testele și imaginile de probă sunt incluse în sursă, dar nu intră în `dist` și nu înlocuiesc verificarea camerei pe telefon.

Butonul `AR` deschide `ar.html`. Această pagină combină camera cu recunoașterea reperului Hiro prin AR.js 3.4.8 și cu randarea Three.js. Pe lângă horă, selectorul păstrează ansamblul mecanic din demonstrația VFX „Hologramă”, afișat solid sau ca proiecție, cu mărime reglabilă.

1. Descarcă reperul de pe pagina AR. Tipărește-l pe hârtie mată, cu latura neagră de aproximativ 8–12 cm și marginea albă păstrată. Poate fi afișat și pe un al doilea ecran.
2. Deschide https://vladika-sys.github.io/vfx-lab/ar.html pe telefon, în Safari sau Chrome, nu în browserul integrat al unei aplicații de mesagerie.
3. Apasă „Pornește camera” și permite accesul. Aplicația solicită camera din spate, fără microfon.
4. Încadrează întregul reper, la lumină suficientă, fără reflexii. Obiectul apare numai când reperul este recunoscut și dispare când reperul nu mai este vizibil.
5. Schimbă aspectul obiectului sau mărimea. Butonul de închidere oprește camera; camera se oprește și când pagina este ascunsă sau părăsită.

QR-ul deschide adresa; reperul Hiro este cel care stabilește poziția obiectului. Nu sunt interschimbabile. Cadrele video sunt procesate pe dispozitiv; aplicația nu le trimite pe server și nu le înregistrează.

Ancorarea este relativă la reper. Calibrarea generică a camerei și estimarea luminii limitează precizia și realismul. Obiectele reale nu ascund automat obiectul virtual. Stabilitatea depinde de cameră, lumină și vizibilitatea reperului.

Surse tehnice: [AR.js — marker tracking](https://ar-js-org.github.io/AR.js-Docs/marker-based/), [exemplul Three.js oficial](https://github.com/AR-js-org/AR.js/blob/3.4.8/three.js/examples/basic.html), [Three.js](https://threejs.org/docs/), [getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia). Licențele sunt în `public/THIRD_PARTY_LICENSES.txt` și `public/assets/ar/ARTOOLKIT_LICENSE.txt`.

Selecția efectului, două reglaje, pauză, ascunderea efectului, resetarea camerei și ecran complet sunt în bara de jos. Camera se rotește prin tragere și se apropie cu rotița mouse-ului. Ascunderea unui efect păstrează decorul. În demonstrația cu fundal verde, comutatorul revine la imaginea neprelucrată. Pentru a examina explozia, pune pauză și deplasează primul cursor.

Cele 14 efecte folosesc decoruri texturate și lumină HDR: ploaie, fum, foc volumetric, ninsoare și depuneri, apă cu reflexii și valuri, descărcări electrice, portal spre o altă scenă 3D, explozie cu flacără și resturi, tornadă volumetrică, praf în lumină, picături pe sticlă, holograma unui ansamblu mecanic, distorsiune termică și eliminarea fundalului verde.

Sunt aproximări interactive, nu simulări fizice complete de producție cinematografică. Portalul și holograma sunt efecte de ficțiune. Exemplul cu fundal verde combină imagini randate local, nu filmări reale.

## Surse vizuale

Texturile și cerul sunt fișiere locale în `public/assets/weather`, descărcate din API-ul public Poly Haven la rezoluția 1K:

- [Asphalt 02](https://polyhaven.com/a/asphalt_02): culoare, normale și rugozitate.
- [Concrete Wall 006](https://polyhaven.com/a/concrete_wall_006): culoare, normale și rugozitate.
- [Overcast Soil PureSky](https://polyhaven.com/a/overcast_soil_puresky): cer HDR.

Aceste resurse sunt oferite sub [licența CC0](https://polyhaven.com/license).

## Fișiere

`src/main.js` gestionează scena VFX și comenzile. `src/weather-scenes.js` conține ploaia, fumul și decorul, iar `src/cinematic-effects.js` implementează celelalte 12 efecte. `src/ar.js` gestionează camera și sesiunea AR. Dansatorii sunt în `src/hora.js`, coregrafia în `src/hora-motion.js`, iar editorul de fotografii în `src/object-editor.js`. Interfața este definită în paginile HTML și `src/style.css`.
