# Ritual — mască Halloween pentru urmărirea feței

Proiect Blender 5.2.1 LTS, construit pentru pagina `face.html`. Modelul anterior din lemn este păstrat separat, în `../masca_lemn/`; nu mai este folosit de pagină.

## Fișiere și construcție

- `masca_ritual.blend`: sursa editabilă, texturi împachetate, luminile și camera de atelier.
- `masca_ritual.glb`: modelul folosit în Three.js, cu texturi incluse.
- `construieste_masca.py`: construcția reproductibilă a geometriei și texturilor.
- `model.json`: dimensiunea exportului, materialele și numărul de triunghiuri.
- `randari/`: vederi din față, perspectivă și maxilar deschis. Lumina de studio nu este identică iluminării din aplicație.
- `texturi/`: culoare de 2048 px, normale și rugozitate de 1024 px. Patina, porii, arsurile și petele de sânge sunt generate în Blender cu NumPy, nu descărcate.

Geometria facială de referință provine din MediaPipe, sub Apache 2.0. Fișierul și licența sunt în `referinte/`. Suprafața a fost remodelată prin relief pe arcade și pomeți, depresiuni pe obraji, grosime, fisuri sculptate, ochi și cavitate nazală decupate. Coarnele sunt volume conice curbate, cu variații ale razei și vârfuri asimetrice. Capsele, colții și filamentele de sânge au geometrie proprie. Fisurile luminoase folosesc un material emisiv exportabil glTF.

## Maxilar și acoperire

`MaskRoot` conține suprafața superioară `MaskShell`, articulația `JawPivot` și căptușeala `MouthLiner`. `Jaw` este copilul articulației. Piesele principale se suprapun cu 2 mm în repaus; nu există fanta permanentă a modelului vechi. Marginea inferioară este extinsă dincolo de conturul canonic al bărbiei. Căptușeala continuă închide și regiunea interioară a buzelor, pentru a nu lăsa pielea vizibilă între piese.

GLB folosește metri și axele X dreapta, Y sus, Z înainte. Aplicația folosește centimetri și scalează modelul cu 100. Articulația este la `(0, -3, -0.7)` cm în reperul canonic; deschiderea maximă este 16° pe X.

Animația Blender `JawOpen` permite inspectarea rotației. Potrivirea suplimentară a bărbiei și întinderea căptușelii sunt calculate în aplicație, în `src/face-fit.js`; simpla rulare a animației Blender nu reproduce această potrivire. Raportul dintre distanța buzelor interioare și lățimea gurii controlează deschiderea. Punctul 152 urmărește bărbia. Corecția reziduală se aplică progresiv spre partea de jos, păstrând îmbinarea superioară închisă în repaus. Modificarea geometriei actualizează și normalele.

`EmberFissures` pulsează lent și se intensifică la deschiderea gurii. Aplicația desenează separat componentele emisive, cu mascarea în adâncime, apoi aplică un halou de rezoluție redusă. Nu aplică lumină roșie peste întregul video.

## Verificare și limite

Testele JavaScript includ închiderea gurii, întoarcerea capului, deschiderea și acoperirea reperelor pe geometria GLB. `tests/face-rig.html` este o probă geometrică cu repere sintetice. `tests/face-session.html` folosește recunoașterea MediaPipe reală pe un flux video simulat cu portretul NASA documentat în teste.

Aceste verificări nu înlocuiesc camera fizică și nu garantează potrivire exactă pentru fiecare fizionomie, profil extrem sau acoperirea feței. Masca este un efect artistic, nu un model facial personalizat sau un dispozitiv de protecție.
