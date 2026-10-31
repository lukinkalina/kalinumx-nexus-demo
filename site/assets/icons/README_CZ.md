# KalinumX Icon Library

Tato složka je rozšiřitelný zdroj ikon pro Core a huby.

Pravidla:
- canonical identita ikony je `ICON.CODE`, ne cesta k souboru;
- UI smí změnit icon style bez změny business dat;
- SVG preferovat jako lehký zdroj; rastrové varianty jen když jsou skutečně nutné;
- app/hub může mít vlastní icon family, ale sdílené akce používají Core icon registry;
- nové ikony musí mít preview, light/dark kontrast a mobilní kontrolu;
- žádné fontové ikony jako jediný zdroj pravdy;
- velké obrazové sady nepatří do Core DB; drží se jako FILE/asset pack s manifestem.

Aktuální SVG jsou malé bezpečné fallbacky. Luxusní 3D/droplet sady lze doplnit později jako asset pack bez změny `ICON.CODE`.
