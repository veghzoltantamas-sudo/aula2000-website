const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('/root/aula2000-new/data/database.sqlite');

const servicesData = [
  {
    id: 1,
    title: 'Generál tervezés',
    short_desc: 'Teljes körű építészeti és generáltervezés, a legelső vázlattervtől a hatósági engedélyeken át a részletes kivitelezési dokumentációig és szakági koordinációig.',
    image: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1200&q=80',
    gallery_images: JSON.stringify([
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80'
    ]),
    description: `
      <div class="service-rich-content">
        <h2 class="fw-bold mb-3 text-dark">Átfogó generáltervezési mérnöki szolgáltatás</h2>
        <p class="lead text-muted mb-4">
          Az Aula 2000 Építész Iroda 1995-ös alapítása óta biztosít prémium szintű, komplex generáltervezési szolgáltatást. Tervezőirodánk összefogja a teljes építészeti, statikai, épületgépészeti, épületvillamossági és szakági tervezői csapatot, így Önnek egyetlen kézben összpontosul a teljes beruházás műszaki felelőssége.
        </p>

        <div class="row g-4 my-4">
          <div class="col-md-6">
            <div class="p-4 rounded bg-light border-start border-4 border-warning h-100 shadow-sm">
              <h4 class="fw-bold text-dark mb-2"><i class="fa-solid fa-layer-group text-warning me-2"></i>Tervezési Szakterületek</h4>
              <ul class="list-unstyled mb-0">
                <li class="py-1"><i class="fa-solid fa-check text-success me-2"></i><strong>Családi és társasházak:</strong> egyedi, energiatudatos otthonok.</li>
                <li class="py-1"><i class="fa-solid fa-check text-success me-2"></i><strong>Irodaházak & Székházak:</strong> modern munkakörnyezetek.</li>
                <li class="py-1"><i class="fa-solid fa-check text-success me-2"></i><strong>Ipari és logisztikai létesítmények:</strong> csarnokok, raktárak.</li>
                <li class="py-1"><i class="fa-solid fa-check text-success me-2"></i><strong>Középületek, szállodák & vendéglátás:</strong> funkcionális terek.</li>
              </ul>
            </div>
          </div>
          <div class="col-md-6">
            <div class="p-4 rounded bg-light border-start border-4 border-warning h-100 shadow-sm">
              <h4 class="fw-bold text-dark mb-2"><i class="fa-solid fa-clipboard-check text-warning me-2"></i>A Tervezés Lépései</h4>
              <ol class="ps-3 mb-0">
                <li class="py-1"><strong>Koncepció- és tanulmányterv:</strong> igényfelmérés és telekadottságok.</li>
                <li class="py-1"><strong>Engedélyezési / Egyszerű bejelentési terv:</strong> hatósági egyeztetés.</li>
                <li class="py-1"><strong>Kiviteli tervdokumentáció:</strong> milliméter-pontos csomópontok.</li>
                <li class="py-1"><strong>Tervezői művezetés:</strong> építkezés helyszíni ellenőrzése.</li>
              </ol>
            </div>
          </div>
        </div>

        <h3 class="fw-bold mt-4 mb-3 text-dark">Miért elengedhetetlen a professzionális generáltervezés?</h3>
        <p>
          A generáltervező szerepe kulcsfontosságú az építkezés költség- és időkeretének betartásában. Tervezőink BIM-szemléletű és összehangolt 3D modellezéssel küszöbölik ki az ütközéseket a gépészeti vezetékek, a tartószerkezetek és az építészeti elemek között még az építkezés megkezdése előtt. Ezzel jelentős felesleges bontási és pótmunkaköltségeket spórolunk meg megrendelőinknek.
        </p>
      </div>
    `
  },
  {
    id: 2,
    title: 'Beruházás bonyolítás',
    short_desc: 'Projektmenedzsment a tervezéstől a kulcsátadásig: pályázati menedzsment, tendereztetés, költségkontroll és műszaki ellenőrzés.',
    image: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80',
    gallery_images: JSON.stringify([
      'https://images.unsplash.com/photo-1541888946425-d0fbb18086f6?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=800&q=80'
    ]),
    description: `
      <div class="service-rich-content">
        <h2 class="fw-bold mb-3 text-dark">Teljes körű beruházás-bonyolítás és projektvezetés</h2>
        <p class="lead text-muted mb-4">
          Egy nagyobb építési beruházás sikere a pontos előkészítésen, a szigorú költségkövetésen és a folyamatos helyszíni műszaki koordináción múlik. Az Aula 2000 Iroda leveszi az építtető válláról az adminisztratív, szervezési és jogi terheket.
        </p>

        <div class="row g-4 my-4">
          <div class="col-md-6">
            <div class="p-4 rounded bg-light border-start border-4 border-warning h-100 shadow-sm">
              <h4 class="fw-bold text-dark mb-2"><i class="fa-solid fa-handshake text-warning me-2"></i>Bonyolítási Feladatkörök</h4>
              <ul class="list-unstyled mb-0">
                <li class="py-1"><i class="fa-solid fa-check text-success me-2"></i><strong>Tender- és versenyeztetés:</strong> kivitelezői árajánlatok műszaki értékelése.</li>
                <li class="py-1"><i class="fa-solid fa-check text-success me-2"></i><strong>Szerződés-előkészítés:</strong> garanciák és határidők pontos rögzítése.</li>
                <li class="py-1"><i class="fa-solid fa-check text-success me-2"></i><strong>Költségkontroll:</strong> folyamatos pénzügyi és műszaki monitoring.</li>
                <li class="py-1"><i class="fa-solid fa-check text-success me-2"></i><strong>Felelős műszaki ellenőrzés:</strong> minőségellenőrzés a helyszínen.</li>
              </ul>
            </div>
          </div>
          <div class="col-md-6">
            <div class="p-4 rounded bg-light border-start border-4 border-warning h-100 shadow-sm">
              <h4 class="fw-bold text-dark mb-2"><i class="fa-solid fa-award text-warning me-2"></i>Pályázati Tanácsadás</h4>
              <p class="text-muted mb-2">Kiemelt tapasztalattal rendelkezünk hazai és Európai Uniós forrásból finanszírozott beruházások műszaki előkészítésében:</p>
              <ul class="list-unstyled mb-0">
                <li class="py-1"><i class="fa-solid fa-check text-success me-2"></i>Pályázati műszaki adatlapok kitöltése</li>
                <li class="py-1"><i class="fa-solid fa-check text-success me-2"></i>Előzetes költségvetés és megvalósíthatósági tanulmány</li>
                <li class="py-1"><i class="fa-solid fa-check text-success me-2"></i>Elszámolási és teljesítésigazolási eljárások lebonyolítása</li>
              </ul>
            </div>
          </div>
        </div>

        <h3 class="fw-bold mt-4 mb-3 text-dark">Biztonság és kiszámíthatóság az építtető számára</h3>
        <p>
          Megbízóink számára biztosítjuk a teljes transzparenciát. Rendszeres heti státuszjelentésekkel, e-napló bejegyzések ellenőrzésével, valamint a részteljesítések szigorú felmérésével garantáljuk, hogy az épület az engedélyezett terveknek és a költségvetésnek megfelelően valósuljon meg.
        </p>
      </div>
    `
  },
  {
    id: 3,
    title: 'Látványtervezés',
    short_desc: 'Fotorealisztikus 3D külső és belső látványtervek, virtuális séta (VR) és napfény-szimuláció a döntések megkönnyítésére.',
    image: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80',
    gallery_images: JSON.stringify([
      'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1618219908412-a29a1bb7b86e?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=800&q=80'
    ]),
    description: `
      <div class="service-rich-content">
        <h2 class="fw-bold mb-3 text-dark">Fotorealisztikus 3D Látványtervezés és Térélmény</h2>
        <p class="lead text-muted mb-4">
          A modern építészet elengedhetetlen eszköze a valósághű 3D vizualizáció. Segítségével még az első kapa vágása előtt láthatja leendő otthonát vagy üzleti létesítményét a valós környezetében, élethű fényekkel, textúrákkal és bútorzattal.
        </p>

        <div class="row g-4 my-4">
          <div class="col-md-6">
            <div class="p-4 rounded bg-light border-start border-4 border-warning h-100 shadow-sm">
              <h4 class="fw-bold text-dark mb-2"><i class="fa-solid fa-cube text-warning me-2"></i>Vizualizációs Szolgáltatásaink</h4>
              <ul class="list-unstyled mb-0">
                <li class="py-1"><i class="fa-solid fa-check text-success me-2"></i><strong>Külső homlokzati látványtervek:</strong> nappali és esti megvilágítási képek.</li>
                <li class="py-1"><i class="fa-solid fa-check text-success me-2"></i><strong>Belsőépítészeti látványképek:</strong> anyagok, bútorok, világítástervezés.</li>
                <li class="py-1"><i class="fa-solid fa-check text-success me-2"></i><strong>360°-os panorámatúrák és VR:</strong> interaktív virtuális bejárás.</li>
                <li class="py-1"><i class="fa-solid fa-check text-success me-2"></i><strong>Építészeti animációk:</strong> bemutató videók értékesítéshez.</li>
              </ul>
            </div>
          </div>
          <div class="col-md-6">
            <div class="p-4 rounded bg-light border-start border-4 border-warning h-100 shadow-sm">
              <h4 class="fw-bold text-dark mb-2"><i class="fa-solid fa-sun text-warning me-2"></i>Napfény- és Árnyékelemzés</h4>
              <p class="text-muted mb-2">A látványtervezés nálunk nem csupán esztétika, hanem funkcionális döntéstámogatás:</p>
              <ul class="list-unstyled mb-0">
                <li class="py-1"><i class="fa-solid fa-check text-success me-2"></i>Valós földrajzi koordináták alapján számított napjárás</li>
                <li class="py-1"><i class="fa-solid fa-check text-success me-2"></i>Teraszok és belső terek árnyékolási szimulációja</li>
                <li class="py-1"><i class="fa-solid fa-check text-success me-2"></i>Nagyüvegű felületek túlmelegedésének megelőzése</li>
              </ul>
            </div>
          </div>
        </div>

        <h3 class="fw-bold mt-4 mb-3 text-dark">Ingatlanértékesítés és Pályázati prezentációk</h3>
        <p>
          Ingatlanfejlesztőknek és magánépíttetőknek készített képeink kiemelkedő marketingértéket képviselnek. Segítségükkel a leendő vásárlók azonnal érzelmileg elköteleződnek az ingatlan iránt, meggyorsítva a tervasztalról történő értékesítést.
        </p>
      </div>
    `
  },
  {
    id: 4,
    title: 'Energetikai tanúsítás',
    short_desc: 'Hivatalos HET energetikai tanúsítványok, energetikai felülvizsgálatok és korszerűsítési javaslatok készítése hitelesített szakértővel.',
    image: 'https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?auto=format&fit=crop&w=1200&q=80',
    gallery_images: JSON.stringify([
      'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1509391365360-2e959784a276?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1545259741-2ea3ebf61fa3?auto=format&fit=crop&w=800&q=80'
    ]),
    description: `
      <div class="service-rich-content">
        <h2 class="fw-bold mb-3 text-dark">Hiteles Energetikai Tanúsítás és Korszerűsítés</h2>
        <p class="lead text-muted mb-4">
          Az energiatudatos építészet nemcsak környezetvédelmi kötelesség, hanem komoly anyagi megtakarítás is. Hivatalos jogosultsággal rendelkező energetikai szakértőként készítjük el az épületek hiteles energetikai tanúsítványát (HET kóddal) és korszerűsítési javaslatait.
        </p>

        <div class="row g-4 my-4">
          <div class="col-md-6">
            <div class="p-4 rounded bg-light border-start border-4 border-warning h-100 shadow-sm">
              <h4 class="fw-bold text-dark mb-2"><i class="fa-solid fa-certificate text-warning me-2"></i>Mikor kötelező a tanúsítvány?</h4>
              <ul class="list-unstyled mb-0">
                <li class="py-1"><i class="fa-solid fa-check text-success me-2"></i><strong>Új épület építésekor:</strong> használatbavételi engedélyhez.</li>
                <li class="py-1"><i class="fa-solid fa-check text-success me-2"></i><strong>Ingatlan adásvételkor:</strong> a szerződés kötelező eleme.</li>
                <li class="py-1"><i class="fa-solid fa-check text-success me-2"></i><strong>Bérbeadás esetén:</strong> bérleti szerződés mellékleteként.</li>
                <li class="py-1"><i class="fa-solid fa-check text-success me-2"></i><strong>Energetikai pályázatokhoz:</strong> Otthonfelújítási programokhoz.</li>
              </ul>
            </div>
          </div>
          <div class="col-md-6">
            <div class="p-4 rounded bg-light border-start border-4 border-warning h-100 shadow-sm">
              <h4 class="fw-bold text-dark mb-2"><i class="fa-solid fa-leaf text-warning me-2"></i>Energetikai optimalizálás</h4>
              <p class="text-muted mb-2">Nem pusztán egy papírt adunk át, hanem valódi értéknövelő mérnöki javaslatcsomagot:</p>
              <ul class="list-unstyled mb-0">
                <li class="py-1"><i class="fa-solid fa-check text-success me-2"></i>Hőszigetelés és nyílászárók optimális méretezése</li>
                <li class="py-1"><i class="fa-solid fa-check text-success me-2"></i>Hőszivattyús fűtés, felülethűtés és szellőztető rendszerek</li>
                <li class="py-1"><i class="fa-solid fa-check text-success me-2"></i>Napelemes rendszerek és megújuló energiaforrások</li>
              </ul>
            </div>
          </div>
        </div>

        <h3 class="fw-bold mt-4 mb-3 text-dark">Gyors ügyintézés, precíz felmérés Szegeden és környékén</h3>
        <p>
          Rövid határidővel vállaljuk lakások, családi házak, társasházak és ipari létesítmények helyszíni felmérését és az Országos Építésügyi Nyilvántartásba történő feltöltését.
        </p>
      </div>
    `
  }
];

const blogPostsData = [
  {
    id: 1,
    title: 'Hogyan válasszunk megbízható generáltervezőt?',
    cover: '/uploads/blog-general-tervezes.jpg',
    excerpt: 'Egy sikeres építkezés alapja a felkészült generáltervező. Mire érdemes figyelni a szerződéskötés előtt, és hogyan spórolhat milliókat egy alapos tervdokumentáció?',
    content: `
Egy épület megvalósítása az egyik legjelentősebb beruházás az ember életében, akár családi házról, akár ipari vagy kereskedelmi létesítményről van szó. A siker kulcsa az a szakember, aki nem csupán megálmodja az épületet, hanem felelősséget vállal annak teljes műszaki működőképességéért: a generáltervező.

### Mit csinál pontosan egy generáltervező?
Sokan úgy gondolják, az építész csak a falak helyét rajzolja meg. A valóságban a generáltervező egy karmester, aki összehangolja az összes szakág munkáját:
1. **Tartószerkezeti tervező (Statikus):** biztosítja az épület stabilitását, a födémek és alapozások teherbírását.
2. **Épületgépész:** megtervezi a fűtést, hűtést, vízellátást, csatornázást és a hővisszanyerős szellőzést.
3. **Épületvillamossági mérnök:** felel a hálózatért, világításért, intelligens épületfelügyeletért és a napelem integrációért.
4. **Tűzvédelmi és akusztikai szakértők:** garantálják az előírások maradéktalan betartását.

<div class="my-4 text-center">
  <img src="https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=900&q=80" alt="Generáltervezési munkafolyamat" class="img-fluid rounded shadow" style="max-height:450px; width:100%; object-fit:cover;">
  <p class="text-muted small mt-2">1. ábra: Tervkonzultáció és szakági egyeztetés az Aula 2000 irodában</p>
</div>

### Az 5 legfontosabb szempont a döntés előtt

* **Referenciák és megvalósult épületek:** Mindig kérjen megtekinthető referenciákat! Nem a 3D képek, hanem a valóságban felépült és évek óta jól funkcionáló épületek bizonyítják a tapasztalatot.
* **Komplex felelősségvállalás:** Olyan irodát válasszon, amelyik generálban dolgozik és szerződésben vállalja a határidőket, valamint a szakágak közötti koordinációt.
* **BIM és modern technológia alkalmazása:** A 3D alapú BIM tervezéssel az épület még digitális formában felépül, így az összes kivitelezési hiba és csőütközés már a monitoron kiderül.
* **Költségérzékenység:** Egy jó tervező nem a legdrágább anyagokat választja, hanem az Ön költségkeretéhez igazítja a műszaki megoldásokat.
* **Tervezői művezetés a helyszínen:** A tervező jelenléte az építkezésen nélkülözhetetlen, hogy a kivitelező pontosan a tervek szerint haladjon.

<div class="my-4 text-center">
  <img src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80" alt="Megvalósult modern lakóépület" class="img-fluid rounded shadow" style="max-height:450px; width:100%; object-fit:cover;">
  <p class="text-muted small mt-2">2. ábra: Generáltervezésünk alapján átadott energiatudatos modern otthon</p>
</div>

### Összegzés
A tervezésen megspórolt néhány százezer forint az építkezés során milliókba kerülhet hibák és csúszások formájában. Az Aula 2000 Építész Iroda több mint 25 év tapasztalatával garanciát nyújt a professzionális megvalósításra.
    `
  },
  {
    id: 2,
    title: 'Az energetikai tanúsítvány szerepe a tervezésben',
    cover: '/uploads/blog-energetika-epiteszet.jpg',
    excerpt: 'Miért kötelező és hogyan válik valódi értéknövelő eszközzé az épületenergetika? Új jogszabályi követelmények és gyakorlati energiamegtakarítás.',
    content: `
Az elmúlt években az energiaárak emelkedése és a szigorodó uniós épületenergetikai előírások alapjaiban változtatták meg a tervezési szemléletet. Ma már nem elegendő, hogy egy épület szép legyen: gazdaságosan és fenntarthatóan kell üzemeltethetőnek lennie az elkövetkező 50 évben.

### Mi az az energetikai tanúsítvány?
Az épület energetikai tanúsítványa (HET) egy olyan hivatalos mérnöki dokumentum, amely megmutatja az ingatlan fajlagos primer energiafogyasztását és szén-dioxid kibocsátását. 

Az új épületeknél ma már alapkövetelmény a **közel nulla vagy annál jobb energiaigény**. Ez azt jelenti, hogy az energiafogyasztás jelentős részét helyszíni megújuló energiából (pl. hőszivattyú, napelem) kell fedezni.

<div class="my-4 text-center">
  <img src="https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?auto=format&fit=crop&w=900&q=80" alt="Energetikai vizsgálat és hőszivattyús rendszerek" class="img-fluid rounded shadow" style="max-height:450px; width:100%; object-fit:cover;">
  <p class="text-muted small mt-2">1. ábra: Korszerű hőszivattyús és napelemes technológiák méretezése</p>
</div>

### A három kulcstényező a tervezőasztalon

1. **A termikus burok tökéletessége:** A falak, lábazatok és a tető rétegrendjének optimális hőszigetelése, valamint a 3 rétegű hőszigetelő üvegezéssel ellátott nyílászárók és a hőhidak minimalizálása.
2. **Megújuló energiák intelligens használata:** Levegő-víz vagy geotermikus hőszivattyúk, felületfűtés-hűtés, valamint a tetőfelületre optimalizált napelemes kiserőmű.
3. **Szellőztetés hővisszanyeréssel:** A modern légtömör épületekben a friss levegő biztosításához gépi hővisszanyerős szellőztetés szükséges, amely minimális hőveszteség mellett cseréli a belső levegőt.

<div class="my-4 text-center">
  <img src="https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=900&q=80" alt="Energiatudatos belső tér kialakítása" class="img-fluid rounded shadow" style="max-height:450px; width:100%; object-fit:cover;">
  <p class="text-muted small mt-2">2. ábra: Természetes bevilágítás és energiatudatos belsőépítészeti megoldások</p>
</div>

### Miért éri meg már a koncepció fázisban energetikussal dolgozni?
Ha az energetikai számításokat csak az engedélyeztetés végén futtatják le, a szükséges módosítások drága szerkezetváltást vonhatnak maguk után. Irodánkban az építész és az energetikus szakember az első naptól együtt dolgozik, garantálva a legkorszerűbb energetikai besorolást a legkedvezőbb kivitelezési költség mellett.
    `
  },
  {
    id: 3,
    title: 'Fenntartható anyagok az építészetben',
    cover: '/uploads/blog-fenntarthato-anyagok.jpg',
    excerpt: 'Ökológiai lábnyom csökkentése, újrahasznosított és természetes építőanyagok használata a modern kortárs építészetben.',
    content: `
A modern építészet legnagyobb kihívása ma az emberi élettér megteremtése a természettel harmóniában. A fenntarthatóság nem csupán az alacsony fűtésszámlát jelenti, hanem azt is, hogy milyen környezeti terheléssel jár az építőanyagok kitermelése, szállítása, beépítése és esetleges későbbi újrahasznosítása.

### Természetes anyagok reneszánsza

* **Fa és rétegragasztott fatartók (CLT):** A fa az egyetlen megújuló szerkezeti építőanyag, amely növekedése során szén-dioxidot köt meg. A modern mérnöki fatermékek tűzállósága és teherbírása vetekszik az acéléval.
* **Természetes hőszigetelések:** Kőzetgyapot, fagyapot, cellulóz és parafa szigetelések, amelyek kiváló páraáteresztő képességükkel egészséges belső mikroklímát teremtenek.
* **Kő és kerámia homlokzatburkolatok:** Rendkívül hosszú élettartamú, időtálló anyagok, amelyek nem igényelnek rendszeres újrafestést vagy karbantartást.

<div class="my-4 text-center">
  <img src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80" alt="Természetes fa és kő burkolatok modern környezetben" class="img-fluid rounded shadow" style="max-height:450px; width:100%; object-fit:cover;">
  <p class="text-muted small mt-2">1. ábra: Fa, üveg és kő harmonikus együttélése kortárs épületünkön</p>
</div>

### Körkörös gazdaság és zöld minősítések
Tervezési filozófiánkban kiemelt figyelmet fordítunk arra, hogy helyi beszállítóktól származó, alacsony beépített energiájú anyagokat specifikáljunk. Ez nemcsak a karbonlábnyomot csökkenti, hanem a helyi gazdaságot is támogatja.

<div class="my-4 text-center">
  <img src="https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=900&q=80" alt="Zöldtető és természetközeli terek" class="img-fluid rounded shadow" style="max-height:450px; width:100%; object-fit:cover;">
  <p class="text-muted small mt-2">2. ábra: Intenzív és extenzív zöldtetők hűtő és csapadékmegtartó hatása</p>
</div>

### A zöldtetők és zöldhomlokzatok ereje
A zöldtető nemcsak gyönyörű, hanem természetes hőszigetelőként működik nyáron, megfogja a hirtelen lezúduló csapadékvizet, és kellemes mikroklímát hoz létre az épület közvetlen környezetében.
    `
  },
  {
    id: 4,
    title: '3D látványterv: miért fontos a tervezés folyamatában?',
    cover: '/uploads/blog-3d-latvanytervezes.jpg',
    excerpt: 'Hogyan segít a fotorealisztikus látványtervezés elkerülni a költséges félreértéseket és megteremteni a tökéletes összhangot az építtető és a tervező között?',
    content: `
A 2D-s alaprajzok és metszetek kiválóak a szakemberek számára, ám a laikus megrendelőnek rendkívül nehéz elképzelnie, hogyan fog érvényesülni a valóságban a belmagasság, miként vetülnek a fények a nappaliba délután 4 órakor, vagy hogyan harmonizál a padlóburkolat a konyhabútorral.

### A 3D látványtervezés előnyei

1. **Azonnali térérzékelés és döntéstámogatás:** Nincsenek kellemetlen meglepetések a helyszínen, mert már a tervfázisban pontosan látható a terek egymáshoz viszonyított mérete.
2. **Költségmegtakarítás a kivitelezéskor:** Sokkal olcsóbb és egyszerűbb a számítógépen megváltoztatni egy fal elhelyezését vagy a csempe színét, mint a már felépített szerkezetet bontani és újraépíteni.
3. **Valósághű fényviszonyok és napállás vizsgálata:** Szoftvereink a pontos szegedi vagy regionális napjárási adatokat szimulálják az év 365 napján.

<div class="my-4 text-center">
  <img src="https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=900&q=80" alt="3D belsőépítészeti látványterv" class="img-fluid rounded shadow" style="max-height:450px; width:100%; object-fit:cover;">
  <p class="text-muted small mt-2">1. ábra: Fotorealisztikus 3D belsőépítészeti vizualizáció</p>
</div>

### Virtuális valóság (VR) bejárás
Irodánkban lehetőség van arra is, hogy VR szemüvegen keresztül Ön körbesétáljon leendő otthonában vagy irodájában még a kivitelezés megkezdése előtt. Megtapasztalhatja a lépcső kényelmét, a kilátást az étkezőablakból vagy a terasz tágasságát.

<div class="my-4 text-center">
  <img src="https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=900&q=80" alt="Esti homlokzati világítás szimulációja" class="img-fluid rounded shadow" style="max-height:450px; width:100%; object-fit:cover;">
  <p class="text-muted small mt-2">2. ábra: Éjszakai és szürkületi homlokzatvilágítási látványterv</p>
</div>

### Forduljon hozzánk bizalommal!
Legyen szó új épületről vagy meglévő átalakításáról, a precíz 3D tervezés biztosítja, hogy a végeredmény pontosan olyan legyen, amilyennek megálmodta.
    `
  }
];

db.serialize(() => {
  const updateService = db.prepare(`UPDATE services SET title = ?, short_desc = ?, description = ?, image = ?, gallery_images = ? WHERE id = ?`);
  servicesData.forEach(s => {
    updateService.run(s.title, s.short_desc, s.description, s.image, s.gallery_images, s.id, (err) => {
      if (err) console.error('Error updating service ' + s.id, err);
      else console.log('Service updated: ' + s.title);
    });
  });
  updateService.finalize();

  const updateBlog = db.prepare(`UPDATE blog_posts SET title = ?, excerpt = ?, content = ?, cover = ? WHERE id = ?`);
  blogPostsData.forEach(b => {
    updateBlog.run(b.title, b.excerpt, b.content, b.cover, b.id, (err) => {
      if (err) console.error('Error updating blog ' + b.id, err);
      else console.log('Blog post updated: ' + b.title);
    });
  });
  updateBlog.finalize();
});

db.close(() => {
  console.log('Database update completed successfully!');
});
