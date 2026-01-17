import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, NgZone, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';

// Tipado de la gasolinera tal y como llega de la API
interface ApiStation {
  Latitud?: string;
  Longitud?: string;
  'Longitud (WGS84)'?: string;
  'Longitud_x0020__x0028_WGS84_x0029_'?: string;

  'Rótulo'?: string;
  Dirección?: string;
  Horario?: string;

  Localidad?: string;
  Provincia?: string;
  Municipio?: string;

  PrecioProducto?: string;

  // Permite el acceso a claves no previstas sin romper el tipado
  [key: string]: unknown;
}

// Respuesta del endpoint de estaciones
interface ApiResponse { ListaEESSPrecio?: ApiStation[]; }

// Provincias y productos
interface ApiProvincia { IDPovincia?: string; IDProvincia?: string; Provincia: string; }
interface ApiProducto { IDProducto: string; NombreProducto: string; }

// Opciones de carburante para el <select>
interface carburantes { id: string; label: string; }

// Modelo para la UI
interface GasolineraView {
  empresa: string;
  direccion: string;
  horario: string;
  localidad: string;
  provincia: string;
  lat: number;
  lon: number;
  distanciaKm: number;
  precio: number | null;
  barata?: boolean; // Marcar la más barata para luego mostrarla destacada
}

// Respuesta de Nominatim (OpenStreetMap)
interface NominatimSearchResult {
  lat: string;
  lon: string;
  display_name: string;
  address?: { state?: string; province?: string; county?: string; postcode?: string; };
}

@Component({
  selector: 'app-inicio',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './inicio.html',
  styleUrl: './inicio.css',
})
export class Inicio implements OnInit {
  // Inputs de búsqueda
  direccion = '';
  numGas: number | string = 5;
  radioKm: number | string = 10;

  // Selector de carburantes
  carburantes: carburantes[] = [];
  IdCarburante = '';

  // Filtro por empresas conocidas
  empresasTop: string[] = [
    'TODAS','REPSOL','CEPSA','BP','SHELL','GALP','MOEVE','AVIA','PLENOIL','PETROPRIX','BALLENOIL','Q8','CARREFOUR','EROSKI','DISA'
  ];
  empresaSeleccionada = 'TODAS';

  // Estados de UI
  loading = false;
  error = '';
  info = '';
  ubicacionTexto = '';

  // Coordenadas calculadas del usuario mapeando dirección a latitud y longitud
  userLat: number | null = null;
  userLon: number | null = null;

  // Resultados para mostrar
  results: GasolineraView[] = [];

  // Caché para evitar llamadas repetidas
  private provinciasCache: ApiProvincia[] | null = null;
  private estacionesCache = new Map<string, ApiStation[]>();

  constructor(private cdr: ChangeDetectorRef, private zone: NgZone) {}

  // Etiqueta del carburante elegido
  get fuelLabel(): string {
    return this.carburantes.find(x => x.id === this.IdCarburante)?.label ?? 'Carburante';
  }

  // Carga inicial de carburantes
  async ngOnInit(): Promise<void> {
    await this.cargarCatalogoCombustibles();
    this.forzarRender();
  }

  // Geocodificar la dirección y lanzar la búsqueda
  async obtenerDireccionYBuscar(): Promise<void> {
    this.setUi({ error: '', info: '', results: [], ubicacionTexto: '' });

    const q = (this.direccion || '').trim();
    if (!q) { this.setUi({ error: 'Introduce una dirección o código postal.' }); return; }

    this.setUi({ loading: true, info: 'Convirtiendo dirección a coordenadas...', error: '' });

    try {
      const geo = await this.geocodeNominatim(q);

      this.ui(() => {
        this.userLat = geo.lat;
        this.userLon = geo.lon;
        this.ubicacionTexto = geo.display;
      });

      await this.buscarCercanas(geo.postcode ?? null);
    } catch {
      this.setUi({ error: 'No se pudo obtener la ubicación de esa dirección.' });
    } finally {
      this.setUi({ loading: false });
    }
  }

  // Buscar estaciones cercanas usando provincia, producto, distancia y empresa
  private async buscarCercanas(postcode: string | null): Promise<void> {
    this.setUi({ error: '', info: '', results: [] });

    const lat = this.userLat, lon = this.userLon;
    if (lat == null || lon == null) { this.setUi({ error: 'No hay coordenadas. Revisa la dirección.' }); return; }

    const idProducto = this.IdCarburante || this.carburantes[0]?.id || '1';
    const km = this.normalizarKm(this.radioKm);
    const limit = this.normalizarLimite(this.numGas);

    this.setUi({ info: `Buscando gasolineras en ${km} km...` });

    try {
      const idProvincia = await this.getProvinciaIdRobusta(lat, lon, postcode);
      const estaciones = await this.getEstacionesProvinciaProducto(idProvincia, idProducto);

      const found = this.filtrarPorDistancia(estaciones, lat, lon, km);
      if (!found.length) { this.setUi({ info: `0 resultados en ${km} km.` }); return; }

      found.sort((a, b) => a.distanciaKm - b.distanciaKm);
      const finalList = limit ? found.slice(0, limit) : found;

      // Marcar la más barata
      this.masBarata(finalList);
      const idx = finalList.findIndex(x => x.barata);
      if (idx > 0) finalList.unshift(finalList.splice(idx, 1)[0]);

      this.setUi({
        results: [...finalList],
        info: `Mostrando ${finalList.length} de ${found.length} encontradas en ${km} km.`,
      });
    } catch {
      this.setUi({ error: 'Error buscando gasolineras (proxy/red o endpoint).' });
    }
  }

  // Descarga los carburantes y elige uno por defecto
  private async cargarCatalogoCombustibles(): Promise<void> {
    try {
      const resp = await fetch('/carburantes/PreciosCarburantes/Listados/ProductosPetroliferos/', {
        headers: { Accept: 'application/json' },
      });

      const productos = (await resp.json()) as ApiProducto[];
      const opts = (productos ?? [])
        .filter(p => p?.IDProducto && p?.NombreProducto)
        .map(p => ({ id: String(p.IDProducto), label: String(p.NombreProducto) }))
        .sort((a, b) => a.label.localeCompare(b.label, 'es'));

      this.ui(() => {
        this.carburantes = opts;

        // Selección automática de carburante
        if (!this.IdCarburante) {
          const prefer = ['Gasolina 95', 'Gasóleo A', 'Gasoleo A'].map(x => x.toLowerCase());
          const f = opts.find(o => prefer.some(p => o.label.toLowerCase().includes(p)));
          this.IdCarburante = f?.id ?? (opts[0]?.id ?? '1');
        }
      });
    } catch {
      // Si el endpoint falla
      this.ui(() => {
        this.carburantes = [{ id: '1', label: 'Producto 1' }];
        this.IdCarburante = this.IdCarburante || '1';
      });
    }
  }

  // Geocodificar dirección a lat/lon usando Nominatim (OpenStreetMap)
  private async geocodeNominatim(q: string): Promise<{ lat: number; lon: number; display: string; postcode?: string }> {
    const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1&countrycodes=es&q=${encodeURIComponent(q)}`;
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error();

    const data = (await r.json()) as NominatimSearchResult[];
    if (!data.length) throw new Error();

    const lat = this.num(data[0].lat);
    const lon = this.num(data[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error();

    return { lat, lon, display: data[0].display_name || q, postcode: data[0].address?.postcode };
  }

  // Obtener provincia
  private async getProvinciaIdRobusta(lat: number, lon: number, postcodeFromSearch: string | null): Promise<string> {
    let provName: string | null = null;
    let postcode: string | null = postcodeFromSearch;

    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&countrycodes=es&lat=${lat}&lon=${lon}`;
      const r = await fetch(url, { headers: { Accept: 'application/json' } });
      const data = (await r.json()) as any;
      provName = data?.address?.state || data?.address?.province || data?.address?.county || null;
      postcode = postcode || data?.address?.postcode || null;
    } catch {}

    if (provName) {
      const provincias = await this.getProvincias();
      const target = this.limpiarParaMatch(String(provName));
      const hit = provincias.find(p => {
        const name = this.limpiarParaMatch(String(p.Provincia ?? ''));
        return name === target || name.includes(target) || target.includes(name);
      });
      if (hit) return String(hit.IDProvincia ?? hit.IDPovincia ?? '00').padStart(2, '0');
    }

    // Dos primeros dígitos del código postal
    const pc = postcode?.trim();
    if (pc && pc.length >= 2) {
      const code2 = pc.slice(0, 2);
      if (/^\d{2}$/.test(code2)) return code2;
    }

    return '00';
  }

  // Descargar provincias
  private async getProvincias(): Promise<ApiProvincia[]> {
    if (this.provinciasCache) return this.provinciasCache;

    const resp = await fetch('/carburantes/PreciosCarburantes/Listados/Provincias/', {
      headers: { Accept: 'application/json' },
    });

    this.provinciasCache = ((await resp.json()) as ApiProvincia[]) ?? [];
    return this.provinciasCache;
  }

  // Descarga estaciones filtradas por provincia y producto
  private async getEstacionesProvinciaProducto(idProvincia: string, idProducto: string): Promise<ApiStation[]> {
    const key = `${idProvincia}_${idProducto}`;
    const cached = this.estacionesCache.get(key);
    if (cached) return cached;

    const url = `/carburantes/PreciosCarburantes/EstacionesTerrestres/FiltroProvinciaProducto/${idProvincia}/${idProducto}`;
    const resp = await fetch(url, { headers: { Accept: 'application/json' } });

    const data = (await resp.json()) as ApiResponse;
    const estaciones = data?.ListaEESSPrecio ?? [];

    this.estacionesCache.set(key, estaciones);
    return estaciones;
  }

  // Filtra por distancia real y por empresa
  private filtrarPorDistancia(estaciones: ApiStation[], lat: number, lon: number, maxKm: number): GasolineraView[] {
    const candidatos = this.filtrarPorCajas(estaciones, lat, lon, maxKm);
    const filtraEmpresa = this.empresaSeleccionada && this.empresaSeleccionada !== 'TODAS';
    const out: GasolineraView[] = [];

    for (const e of candidatos) {
      const la = this.coord(e, ['Latitud']);
      const lo = this.coord(e, ['Longitud (WGS84)','Longitud_x0020__x0028_WGS84_x0029_','Longitud']);
      if (!Number.isFinite(la) || !Number.isFinite(lo)) continue;

      const d = this.distancia(lat, lon, la, lo);
      if (d > maxKm) continue;

      const empresa = this.normalizarEmpresa(String(e['Rótulo'] ?? ''));
      if (filtraEmpresa && empresa !== this.empresaSeleccionada) continue;

      out.push({
        empresa,
        direccion: String(e['Dirección'] ?? '').trim(),
        horario: String(e['Horario'] ?? '').trim(),
        localidad: String((e['Localidad'] ?? e['Municipio'] ?? '') as string).trim(),
        provincia: String(e['Provincia'] ?? '').trim(),
        lat: la,
        lon: lo,
        distanciaKm: d,
        precio: this.parsePrecio(e['PrecioProducto']),
      });
    }
    return out;
  }

  // Lee coordenadas
  private coord(e: ApiStation, keys: string[]): number {
    for (const k of keys) {
      const v = e[k];
      if (v != null && String(v).trim() !== '') return this.num(v);
    }
    return NaN;
  }

  // Pre-filtro rápido con “caja” para evitar calcular distancia a todas
  private filtrarPorCajas(estaciones: ApiStation[], lat: number, lon: number, maxKm: number): ApiStation[] {
    const latDelta = maxKm / 111;
    const lonDelta = maxKm / (111 * Math.cos((lat * Math.PI) / 180));

    const minLat = lat - latDelta, maxLat = lat + latDelta;
    const minLon = lon - lonDelta, maxLon = lon + lonDelta;

    const out: ApiStation[] = [];
    for (const e of estaciones) {
      const la = this.coord(e, ['Latitud']);
      const lo = this.coord(e, ['Longitud (WGS84)','Longitud_x0020__x0028_WGS84_x0029_','Longitud']);
      if (!Number.isFinite(la) || !Number.isFinite(lo)) continue;
      if (la >= minLat && la <= maxLat && lo >= minLon && lo <= maxLon) out.push(e);
    }
    return out;
  }

  // Marca la gsolinera más barata
  private masBarata(list: GasolineraView[]): void {
    let mejor: GasolineraView | null = null;
    for (const x of list) {
      x.barata = false;
      if (x.precio == null) continue;
      if (!mejor || x.precio < (mejor.precio ?? Infinity)) mejor = x;
    }
    if (mejor) mejor.barata = true;
  }

  // Normaliza el límite de resultados
  private normalizarLimite(v: unknown): number {
    const n = Math.trunc(Number(v));
    if (!Number.isFinite(n)) return 50;
    if (n <= 0) return 0;
    return Math.min(5000, n);
  }

  // Normaliza el radio en kilómetros
  private normalizarKm(v: unknown): number {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return 2;
    return Math.min(100, n);
  }

  // Convierte string a number
  private num(v: unknown): number {
    const s = String(v ?? '').trim();
    if (!s) return NaN;
    const n = Number(s.replace(',', '.'));
    return Number.isFinite(n) ? n : NaN;
  }

  // Precio a number o null
  private parsePrecio(v: unknown): number | null {
    const n = this.num(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  // Distancia en KM, se usó Haversine
  private distancia(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const toRad = (x: number) => (x * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  // Normaliza el rótulo
  private normalizarEmpresa(rotuloRaw: string): string {
    const s = this.limpiarParaMatch(rotuloRaw);
    const map: [string, string][] = [
      ['REPSOL','REPSOL'],['CEPSA','CEPSA'],['BP','BP'],['SHELL','SHELL'],['GALP','GALP'],['MOEVE','MOEVE'],
      ['AVIA','AVIA'],['PLENOIL','PLENOIL'],['PETROPRIX','PETROPRIX'],['BALLENOIL','BALLENOIL'],['Q8','Q8'],
      ['CARREFOUR','CARREFOUR'],['EROSKI','EROSKI'],['DISA','DISA'],
    ];
    for (const [k, v] of map) if (s.includes(k)) return v;
    return rotuloRaw?.trim() ? rotuloRaw.trim() : 'SIN MARCA';
  }

  // Normaliza string para comparaciones
  private limpiarParaMatch(str: string): string {
    return String(str ?? '')
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9 ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* Ejecuta cambios dentro de NgZone y fuerza render 
  por un error que se tuvo por el que no se actualizaba la UI */
  private ui(fn: () => void): void {
    this.zone.run(() => {
      fn();
      this.forzarRender();
    });
  }

  // Actualiza estados de UI en bloque
  private setUi(patch: Partial<Pick<Inicio, 'loading' | 'error' | 'info' | 'ubicacionTexto' | 'results'>>): void {
    this.ui(() => Object.assign(this, patch));
  }

  // Fuerza detección de cambios (útil en async/fetch)
  private forzarRender(): void {
    try { this.cdr.detectChanges(); } catch {}
  }
}

