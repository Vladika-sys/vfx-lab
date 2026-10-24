# Mască din lemn pentru efect AR

Model realizat în Blender 5.2.1 LTS: suprafață din lemn de nuc, deschideri pentru ochi, ornamente geometrice din bronz și maxilar separat.

## Fișiere

- `masca_lemn.blend` — proiectul editabil, cu materialele și texturile incluse în fișier. Conține și scena de prezentare, luminile și reperul facial ascuns.
- `masca_lemn.glb` — export pentru Three.js, cu geometrie, texturi și animația maxilarului. Nu include fundalul, luminile, camera de prezentare sau fața de referință.
- `texturi/` — culoare, rugozitate și normale. Materialele nu depind de noduri procedurale disponibile numai în Blender.
- `randari/` — vedere din perspectivă, vedere frontală și maxilar deschis.
- `model.json` — dimensiunea exportului, numărul de triunghiuri și numele elementelor.
- `verificare.json` — rezultatele verificării geometriei, articulației și reimportului GLB.
- `construieste_masca.py` — pașii de construcție în Blender, reproductibili.
- `verifica_modelul.py` — verificări ale proiectului și exportului.

Modelul are 14.320 de triunghiuri și șase primitive de material, grupate în patru obiecte de tip mesh. Exportul are aproximativ 0,76 MB.

## Lucrul în Blender

Deschide `masca_lemn.blend`. În colecția „Masca — model exportabil” se află obiectele care intră în export. Colecția „Prezentare — nu se exporta” conține doar decorul și iluminarea imaginilor de probă. Reperul MediaPipe este ascuns.

La cadrul 1 maxilarul este închis; la cadrul 25 este deschis la 22°. Mutarea cursorului pe axa timpului permite inspectarea articulației. Obiectul de control este `JawPivot`, nu geometria `Jaw`.

## Pregătire pentru aplicație

Structura exportului este:

```
MaskRoot
├── MaskShell
├── BronzeInlays
└── JawPivot
    ├── Jaw
    └── JawInlays
```

GLB folosește metri și axele glTF: X spre dreapta, Y în sus, Z înainte. Reperul facial canonic a fost scalat cu 0,01 din centimetri în metri. La integrarea cu o matrice facială exprimată în centimetri, scala trebuie reconciliată explicit; nu trebuie presupus că matricea și modelul folosesc deja aceleași unități.

`JawPivot` are rotația neutră zero. Deschiderea se poate controla pe axa X între 0 și 0,383972 radiani, în funcție de valoarea `jawOpen` primită de la urmărirea feței. Ca alternativă, exportul include animația `JawOpen`. Nu trebuie pornite simultan animația în buclă și controlul direct al aceleiași articulații.

Masca este rigidă, cu maxilar articulat; nu are un set complet de deformări pentru toate expresiile feței. Este integrată în pagina `face.html` a aplicației, cu MediaPipe Face Landmarker. Scena folosește centimetri, de aceea obiectul GLB este scalat cu 100. Rotația provine din urmărirea feței, iar poziția este potrivită după reperele faciale și proiecția camerei. Maxilarul este controlat direct prin `jawOpen`, nu prin rularea în buclă a animației exportate.

Potrivirea a fost verificată în browser cu un flux video simulat folosind o fotografie NASA din domeniul public. Potrivirea pe camera unui telefon, la persoane diferite, rămâne de verificat pe dispozitiv. Ascunderea după cap este aproximată printr-o suprafață facială și un volum de adâncime, fără recunoașterea mâinilor din fața feței.

## Proveniența geometriei de referință

Suprafața facială de bază provine din [modelul canonic MediaPipe](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/modules/face_geometry/data/canonical_face_model.obj), distribuit sub Apache License 2.0. Copia folosită și textul licenței sunt în `referinte/`; SHA-256 al fișierului este `8bac80443397e113f41a8b565ea72c59390bc031d9defab289dba7bc0c54e618`.

În acest proiect, suprafața a fost remodelată, îngroșată și decupată; au fost create separat ochii deschiși, separația maxilarului, materialele, texturile și ornamentele. Nu a fost descărcată o mască decorată gata făcută.

Reconstrucția și verificarea se pot rula în modul de fundal al Blender, folosind cele două scripturi Python incluse. Scriptul de construcție regenerează fișierele de livrare din acest director; salvează separat orice modificări manuale înainte de a-l rula din nou.
