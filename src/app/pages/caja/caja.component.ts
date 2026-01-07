import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, signal, computed } from '@angular/core';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { ThemeService } from '../../services/theme.service';
import { MonedaArsPipe } from '../../pipes/moneda-ars.pipe';
import { PermisoDirective } from '../../directives/permiso.directive';

interface Caja {
  id: string;
  fecha_apertura: string;
  fecha_cierre: string | null;
  hora_apertura_auto: string | null;
  hora_cierre_auto: string | null;
  monto_inicial: number;
  monto_actual: number;
  monto_cierre: number | null;
  estado: 'abierta' | 'cerrada';
  usuario_apertura: string;
  usuario_cierre: string | null;
  apertura_manual: boolean;
  cierre_manual: boolean;
  created_at?: string;
  updated_at?: string;
}

interface MovimientoCaja {
  id: string;
  caja_id: string;
  tipo: 'ingreso' | 'egreso';
  concepto: string;
  monto: number;
  metodo: 'efectivo' | 'transferencia' | 'tarjeta' | 'otro';
  venta_id: string | null;
  usuario_id: string;
  usuario_nombre: string;
  observaciones: string | null;
  created_at: string;
}

interface ConfiguracionCaja {
  id: string;
  hora_apertura_auto: string;
  hora_cierre_auto: string;
  apertura_automatica_habilitada: boolean;
  cierre_automatico_habilitado: boolean;
  monto_inicial_default: number;
  created_at?: string;
  updated_at?: string;
}

@Component({
  selector: 'app-caja',
  imports: [CommonModule, RouterModule, FormsModule, MonedaArsPipe, PermisoDirective],
  templateUrl: './caja.component.html',
  styleUrl: './caja.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush // ✅ CAMBIO 1: OnPush Strategy
})
export class CajaComponent implements OnInit, OnDestroy {
  // ✅ CAMBIO 2: Conversión a Signals
  
  // Selección explícita de columnas para Supabase
  private readonly COLUMNAS_CAJA = 'id,fecha_apertura,fecha_cierre,hora_apertura_auto,hora_cierre_auto,monto_inicial,monto_actual,monto_cierre,estado,usuario_apertura,usuario_cierre,apertura_manual,cierre_manual,created_at,updated_at';
  private readonly COLUMNAS_MOVIMIENTO = 'id,caja_id,tipo,concepto,monto,metodo,venta_id,usuario_id,usuario_nombre,observaciones,created_at';
  private readonly COLUMNAS_CONFIG = 'id,hora_apertura_auto,hora_cierre_auto,apertura_automatica_habilitada,cierre_automatico_habilitado,monto_inicial_default,created_at,updated_at';
  
  // Estado de la caja - Signals
  cajaActual = signal<Caja | null>(null);
  movimientos = signal<MovimientoCaja[]>([]);
  configuracion = signal<ConfiguracionCaja | null>(null);
  
  // Historial - Signals
  historialCajas = signal<Caja[]>([]);
  cajaSeleccionadaHistorial = signal<string | null>(null);
  movimientosHistorial = signal<MovimientoCaja[]>([]);
  paginaActualHistorial = signal(1);
  cajasPorPagina = 5;
  filtroFechaDesde = signal('');
  filtroFechaHasta = signal('');
  totalCajasHistorial = signal(0);

  // Formularios - No son signals porque están bindeados con ngModel
  montoApertura = 0;
  montoCierre = 0;
  configForm = {
    hora_apertura_auto: '08:00',
    hora_cierre_auto: '20:00',
    apertura_automatica_habilitada: false,
    cierre_automatico_habilitado: false,
    monto_inicial_default: 0
  };

  // UI States - Signals
  mostrarModalApertura = signal(false);
  mostrarModalCierre = signal(false);
  mostrarModalConfiguracion = signal(false);
  mostrarHistorial = signal(false);
  cargando = signal(false);
 isToastVisible = signal(false);
mensajeToast = signal('');
tipoMensajeToast = signal<'success' | 'error' | 'warning'>('success');
private toastTimeout: ReturnType<typeof setTimeout> | null = null;

  // Resumen - Signal
  resumen = signal({
    totalIngresosEfectivo: 0,
    totalVueltos: 0,
    ventasEfectivo: 0,
    cantidadMovimientos: 0,
    diferencia: 0
  });

  // Filtros - Signals
  filtroTipo = signal<'todos' | 'ingreso' | 'egreso'>('todos');

  // Exponer Math para el template
  Math = Math;
  cajaAbierta = signal(false);
  cajaDeFechaAnterior = signal(false);
  mostrarMensajeCaja = signal(true);

  // ✅ CAMBIO 3: Paginación para Scroll Infinito
  private readonly MOVIMIENTOS_POR_PAGINA = 50;
  todosMovimientosCargados = signal(false);
  cargandoMasMovimientos = signal(false);

  mostrarModalRetiro = signal(false);
  montoRetiroInput = 0;
  actualizarMontoDefault = false; // Checkbox del modal retiro

  // Computed signals para mejor performance
  movimientosFiltrados = computed(() => {
    const movs = this.movimientos();
    const filtro = this.filtroTipo();
    
    if (filtro === 'todos') return movs;
    return movs.filter(m => m.tipo === filtro);
  });

  totalPaginasHistorial = computed(() => 
    Math.ceil(this.totalCajasHistorial() / this.cajasPorPagina)
  );

  paginasHistorial = computed(() => {
    const paginas: (number | -1)[] = [];
    const total = this.totalPaginasHistorial();
    const actual = this.paginaActualHistorial();
    
    if (total <= 7) {
      for (let i = 1; i <= total; i++) paginas.push(i);
    } else {
      if (actual <= 4) {
        for (let i = 1; i <= 5; i++) paginas.push(i);
        paginas.push(-1, total);
      } else if (actual >= total - 3) {
        paginas.push(1, -1);
        for (let i = total - 4; i <= total; i++) paginas.push(i);
      } else {
        paginas.push(1, -1);
        for (let i = actual - 1; i <= actual + 1; i++) paginas.push(i);
        paginas.push(-1, total);
      }
    }
    return paginas;
  });

  constructor(
    private supabase: SupabaseService,
    public themeService: ThemeService
  ) {}

  async ngOnInit() {
    this.cargando.set(true);
    try {
      await this.obtenerConfiguracion();
      await this.obtenerCajaActual();
      
      if (this.cajaActual()) {
        await this.cargarMovimientos();
        this.calcularResumen();
      }
      
      this.cargarHistorial();
    } catch (error) {
      console.error('Error al cargar datos:', error);
      this.mostrarToast('Error al cargar datos de caja', 'error');
    } finally {
      this.cargando.set(false);
    }
  }

  ngOnDestroy() {
  if (this.toastTimeout) clearTimeout(this.toastTimeout);
}

  // ========== CARGA DE DATOS ==========

  async cargarDatos() {
    this.cargando.set(true);
    try {
      await Promise.all([
        this.obtenerCajaActual(),
        this.obtenerConfiguracion(),
        this.cargarHistorial()
      ]);
      
      if (this.cajaActual()) {
        await this.cargarMovimientos();
        this.calcularResumen();
      }
    } catch (error) {
      console.error('Error al cargar datos:', error);
      this.mostrarToast('Error al cargar datos de caja', 'error');
    } finally {
      this.cargando.set(false);
    }
  }

  async obtenerCajaActual() {
    // ✅ CAMBIO 4: Selección explícita de columnas
    const { data, error } = await this.supabase
      .getClient()
      .from('cajas')
      .select(this.COLUMNAS_CAJA)
      .eq('estado', 'abierta')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      this.cajaActual.set(data);
      this.montoCierre = data.monto_actual;
      this.cajaAbierta.set(true);

      const fechaCaja = new Date(data.fecha_apertura);
      const hoy = new Date();
      
      const esMismoDia = fechaCaja.getDate() === hoy.getDate() &&
                         fechaCaja.getMonth() === hoy.getMonth() &&
                         fechaCaja.getFullYear() === hoy.getFullYear();

      if (!esMismoDia) {
        this.cajaDeFechaAnterior.set(true);
        setTimeout(() => {
          this.cajaDeFechaAnterior.set(false);
        }, 6000);
      } else {
        this.cajaDeFechaAnterior.set(false);
      }
    } else {
      this.cajaActual.set(null);
      this.cajaAbierta.set(false);
      this.cajaDeFechaAnterior.set(false);
    }

    this.mostrarMensajeCaja.set(true);
    setTimeout(() => {
      this.mostrarMensajeCaja.set(false);
    }, 3000);
  }

  async obtenerConfiguracion() {
    const { data, error } = await this.supabase
      .getClient()
      .from('configuracion_caja')
      .select(this.COLUMNAS_CONFIG)
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      this.configuracion.set(data);
      this.configForm = {
        hora_apertura_auto: data.hora_apertura_auto || '08:00',
        hora_cierre_auto: data.hora_cierre_auto || '20:00',
        apertura_automatica_habilitada: data.apertura_automatica_habilitada || false,
        cierre_automatico_habilitado: data.cierre_automatico_habilitado || false,
        monto_inicial_default: data.monto_inicial_default || 0
      };
      
      if (!this.cajaAbierta()) {
        this.montoApertura = data.monto_inicial_default || 0;
      }
    }
  }

  async cargarMovimientos() {
    const caja = this.cajaActual();
    if (!caja) return;

    // ✅ CAMBIO 5: Paginación inicial
    const { data, error } = await this.supabase
      .getClient()
      .from('movimientos_caja')
      .select(this.COLUMNAS_MOVIMIENTO)
      .eq('caja_id', caja.id)
      .order('created_at', { ascending: false })
      .range(0, this.MOVIMIENTOS_POR_PAGINA - 1);

    if (!error && data) {
      this.movimientos.set(data);
      this.todosMovimientosCargados.set(data.length < this.MOVIMIENTOS_POR_PAGINA);
    }
  }

  // ✅ CAMBIO 6: Scroll Infinito - Cargar más movimientos
  async cargarMasMovimientos() {
    const caja = this.cajaActual();
    if (!caja || this.todosMovimientosCargados() || this.cargandoMasMovimientos()) return;

    this.cargandoMasMovimientos.set(true);

    const movimientosActuales = this.movimientos();
    const desde = movimientosActuales.length;
    const hasta = desde + this.MOVIMIENTOS_POR_PAGINA - 1;

    const { data, error } = await this.supabase
      .getClient()
      .from('movimientos_caja')
      .select(this.COLUMNAS_MOVIMIENTO)
      .eq('caja_id', caja.id)
      .order('created_at', { ascending: false })
      .range(desde, hasta);

    if (!error && data) {
      this.movimientos.update(movs => [...movs, ...data]);
      this.todosMovimientosCargados.set(data.length < this.MOVIMIENTOS_POR_PAGINA);
    }

    this.cargandoMasMovimientos.set(false);
  }

  async cargarHistorial() {
    try {
      let query = this.supabase
        .getClient()
        .from('cajas')
        .select(this.COLUMNAS_CAJA, { count: 'exact' });

      const desde = this.filtroFechaDesde();
      const hasta = this.filtroFechaHasta();

      if (desde) {
        query = query.gte('fecha_apertura', new Date(desde).toISOString());
      }
      if (hasta) {
        const fechaHasta = new Date(hasta);
        fechaHasta.setHours(23, 59, 59, 999);
        query = query.lte('fecha_apertura', fechaHasta.toISOString());
      }

      const { count } = await query;
      this.totalCajasHistorial.set(count || 0);

      const inicio = (this.paginaActualHistorial() - 1) * this.cajasPorPagina;
      const { data, error } = await query
        .order('created_at', { ascending: false })
        .range(inicio, inicio + this.cajasPorPagina - 1);

      if (error) throw error;
      this.historialCajas.set(data || []);
    } catch (error) {
      console.error('Error al cargar historial:', error);
    }
  }

  cambiarPaginaHistorial(pagina: number) {
    if (pagina >= 1 && pagina <= this.totalPaginasHistorial()) {
      this.paginaActualHistorial.set(pagina);
      this.cargarHistorial();
    }
  }

  aplicarFiltroFechas() {
    this.paginaActualHistorial.set(1);
    this.cargarHistorial();
  }

  limpiarFiltroFechas() {
    this.filtroFechaDesde.set('');
    this.filtroFechaHasta.set('');
    this.paginaActualHistorial.set(1);
    this.cargarHistorial();
  }

  // ========== APERTURA Y CIERRE ==========

  abrirModalApertura() {
    if (this.cajaActual()) {
      this.mostrarToast('Ya existe una caja abierta', 'error');
      return;
    }
    this.mostrarModalApertura.set(true);
  }

  cerrarModalApertura() {
    this.mostrarModalApertura.set(false);
  }

  async confirmarApertura() {
    if (this.montoApertura < 0) {
      this.mostrarToast('El monto inicial no puede ser negativo', 'error');
      return;
    }

    this.cargando.set(true);
    try {
      const usuario = await this.obtenerUsuarioActual();
      const ahora = new Date();
      const config = this.configuracion();

      const nuevaCaja = {
        fecha_apertura: ahora.toISOString(),
        monto_inicial: this.montoApertura,
        monto_actual: this.montoApertura,
        estado: 'abierta' as const,
        usuario_apertura: usuario.nombre,
        apertura_manual: true,
        cierre_manual: false,
        hora_apertura_auto: config?.hora_apertura_auto || null,
        hora_cierre_auto: config?.hora_cierre_auto || null
      };

      const { error } = await this.supabase
        .getClient()
        .from('cajas')
        .insert(nuevaCaja)
        .select()
        .single();

      if (error) throw error;

      this.mostrarToast('Caja abierta correctamente', 'success');
      this.mostrarModalApertura.set(false);
      this.cajaAbierta.set(true);
      await this.cargarDatos();
    } catch (error: any) {
      console.error('Error al abrir caja:', error);
      this.mostrarToast(error.message || 'Error al abrir caja', 'error');
    } finally {
      this.cargando.set(false);
    }
  }

  abrirModalCierre() {
    const caja = this.cajaActual();
    if (!caja) {
      this.mostrarToast('No hay caja abierta', 'error');
      return;
    }
    // Solo cargamos el monto actual para comparar
    this.montoCierre = caja.monto_actual;
    this.mostrarModalCierre.set(true);
  }

  cerrarModalCierre() {
    this.mostrarModalCierre.set(false);
  }

  async confirmarCierre() {
    const caja = this.cajaActual();
    if (!caja) return;

    this.cargando.set(true);
    try {
      const usuario = await this.obtenerUsuarioActual();
      // Calculamos la diferencia entre lo que dice el sistema y lo que contó el usuario
      const diferencia = this.montoCierre - caja.monto_actual;

      // 1. Cerrar la caja actual en la base de datos
      const { error } = await this.supabase
        .getClient()
        .from('cajas')
        .update({
          fecha_cierre: new Date().toISOString(),
          monto_cierre: this.montoCierre, // Guardamos el monto físico real contado
          estado: 'cerrada',
          usuario_cierre: usuario.nombre,
          cierre_manual: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', caja.id);

      if (error) throw error;

      // 2. Si hay diferencia (positiva o negativa), registramos el movimiento de ajuste automático
      if (diferencia !== 0) {
        await this.supabase
          .getClient()
          .from('movimientos_caja')
          .insert({
            caja_id: caja.id,
            tipo: diferencia > 0 ? 'ingreso' : 'egreso',
            concepto: diferencia > 0 ? 'Ajuste positivo al cierre' : 'Ajuste negativo al cierre',
            monto: Math.abs(diferencia),
            metodo: 'efectivo',
            usuario_id: usuario.id,
            usuario_nombre: usuario.nombre,
            observaciones: `Diferencia: ${diferencia.toFixed(2)} - Cierre manual (Físico vs Sistema)`,
            created_at: new Date().toISOString()
          });
      }

      this.mostrarToast('Caja cerrada correctamente', 'success');
      this.mostrarModalCierre.set(false);
      
      // Actualizamos estados locales inmediatos
      this.cajaAbierta.set(false);
      this.cajaDeFechaAnterior.set(false);
      
      // Recargamos todos los datos para reflejar cambios en historial
      await this.cargarDatos();

    } catch (error: any) {
      console.error('Error al cerrar caja:', error);
      this.mostrarToast(error.message || 'Error al cerrar caja', 'error');
    } finally {
      this.cargando.set(false);
    }
  }

  // ========== CONFIGURACIÓN ==========

  abrirModalConfiguracion() {
    const config = this.configuracion();
    if (config) {
      this.configForm = {
        hora_apertura_auto: config.hora_apertura_auto || '08:00',
        hora_cierre_auto: config.hora_cierre_auto || '20:00',
        apertura_automatica_habilitada: config.apertura_automatica_habilitada || false,
        cierre_automatico_habilitado: config.cierre_automatico_habilitado || false,
        monto_inicial_default: config.monto_inicial_default || 0
      };
    }
    this.mostrarModalConfiguracion.set(true);
  }

  cerrarModalConfiguracion() {
    this.mostrarModalConfiguracion.set(false);
  }

  async guardarConfiguracion() {
    this.cargando.set(true);
    try {
      const configData = {
        ...this.configForm,
        updated_at: new Date().toISOString()
      };

      const config = this.configuracion();
      if (config) {
        const { error } = await this.supabase
          .getClient()
          .from('configuracion_caja')
          .update(configData)
          .eq('id', config.id);

        if (error) throw error;
      } else {
        const { error } = await this.supabase
          .getClient()
          .from('configuracion_caja')
          .insert(configData);

        if (error) throw error;
      }

      await this.actualizarHorariosCron();
      this.mostrarToast('Configuración guardada.', 'success');
      this.mostrarModalConfiguracion.set(false);
      await this.obtenerConfiguracion();
    } catch (error) {
      console.error('Error al guardar configuración:', error);
      this.mostrarToast('Error al guardar configuración', 'error');
    } finally {
      this.cargando.set(false);
    }
  }

  async actualizarHorariosCron(): Promise<void> {
    try {
      const { data, error } = await this.supabase
        .getClient()
        .rpc('actualizar_horarios_cron');

      if (error) {
        console.error('Error al actualizar horarios de cron:', error);
        this.mostrarToast('Configuración guardada, pero hubo un error actualizando la automatización.', 'error');
      }
    } catch (error: any) {
      console.error('Error al llamar actualizar_horarios_cron:', error);
    }
  }

  // ========== UTILIDADES ==========

  calcularResumen() {
    const movs = this.movimientos();
    
    const totalIngresosEfectivo = movs
      .filter(m => 
        m.tipo === 'ingreso' && 
        m.metodo === 'efectivo' && 
        (m.concepto === 'Efectivo recibido' || 
         m.concepto.includes('Recambio') || 
         m.concepto.includes('Diferencia'))
      )
      .reduce((acc, m) => acc + m.monto, 0);

    const totalVueltos = movs
      .filter(m => m.tipo === 'egreso' && m.concepto === 'Vuelto entregado')
      .reduce((acc, m) => acc + m.monto, 0);

    const ventasEfectivo = totalIngresosEfectivo - totalVueltos;
    const cantidadMovimientos = movs.length;

    const caja = this.cajaActual();
    const diferencia = caja ? this.montoCierre - caja.monto_actual : 0;

    this.resumen.set({
      totalIngresosEfectivo,
      totalVueltos,
      ventasEfectivo,
      cantidadMovimientos,
      diferencia
    });
  }

  async obtenerUsuarioActual() {
    let usuario = await this.supabase.getCurrentUser();
    
    if (!usuario) {
      const vendedorTemp = this.supabase.getVendedorTemp();
      if (vendedorTemp) {
        usuario = vendedorTemp;
      } else {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
          usuario = JSON.parse(storedUser);
        }
      }
    }

    if (!usuario) {
      throw new Error('No se pudo obtener el usuario actual');
    }

    if ('user_metadata' in usuario && usuario.user_metadata) {
      return {
        id: usuario.id || 'unknown',
        nombre: usuario.user_metadata['nombre'] || 'Desconocido'
      };
    } 
    
    if ('id' in usuario && 'nombre' in usuario) {
      return {
        id: (usuario as any).id || 'unknown',
        nombre: (usuario as any).nombre || 'Desconocido'
      };
    }

    return {
      id: 'unknown',
      nombre: 'Desconocido'
    };
  }

  mostrarToast(mensaje: string, tipo: 'success' | 'error' | 'warning' = 'success') {
  this.mensajeToast.set(mensaje);
  this.tipoMensajeToast.set(tipo);
  this.isToastVisible.set(true);
  
  if (this.toastTimeout) clearTimeout(this.toastTimeout);
  this.toastTimeout = setTimeout(() => {
    this.isToastVisible.set(false);
  }, 3000);
}

  formatearFecha(fecha: string): string {
    const date = new Date(fecha);
    const opciones: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'America/Argentina/Buenos_Aires'
    };
    return date.toLocaleString('es-AR', opciones);
  }

  formatearHora(fecha: string): string {
    const date = new Date(fecha);
    const opciones: Intl.DateTimeFormatOptions = {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'America/Argentina/Buenos_Aires'
    };
    return date.toLocaleTimeString('es-AR', opciones);
  }

  async toggleMovimientosHistorial(cajaId: string): Promise<void> {
    if (this.cajaSeleccionadaHistorial() === cajaId) {
      this.cajaSeleccionadaHistorial.set(null);
      this.movimientosHistorial.set([]);
    } else {
      this.cajaSeleccionadaHistorial.set(cajaId);
      await this.cargarMovimientosHistorial(cajaId);
    }
  }

  async cargarMovimientosHistorial(cajaId: string): Promise<void> {
    try {
      const { data, error } = await this.supabase
        .getClient()
        .from('movimientos_caja')
        .select(this.COLUMNAS_MOVIMIENTO)
        .eq('caja_id', cajaId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      this.movimientosHistorial.set(data || []);
    } catch (error) {
      console.error('Error al cargar movimientos del historial:', error);
      this.mostrarToast('Error al cargar movimientos', 'error');
      this.movimientosHistorial.set([]);
    }
  }

  obtenerUltimosDigitosVenta(ventaId: string | null): string {
    if (!ventaId) return '';
    return ventaId.slice(-8);
  }

  getDiferenciaClass(caja: Caja): string {
    if (!caja.monto_cierre) return '';
    const diferencia = caja.monto_cierre - caja.monto_actual;
    if (diferencia > 0) return 'text-green-600';
    if (diferencia < 0) return 'text-red-600';
    return '';
  }

  getDiferenciaTexto(caja: Caja): string {
    if (!caja.monto_cierre) return '-';
    const diferencia = caja.monto_cierre - caja.monto_actual;
    const signo = diferencia > 0 ? '+' : '';
    return `${signo}${diferencia.toFixed(2)}`;
  }

  // ✅ CAMBIO 7: TrackBy para mejor performance en *ngFor
  trackByMovimiento(index: number, item: MovimientoCaja): string {
    return item.id;
  }

  trackByCaja(index: number, item: Caja): string {
    return item.id;
  }

  trackByIndex(index: number): number {
    return index;
  }

  // Setters para compatibilidad con ngModel en filtros
  setFiltroFechaDesde(value: string) {
    this.filtroFechaDesde.set(value);
  }

  setFiltroFechaHasta(value: string) {
    this.filtroFechaHasta.set(value);
  }

  abrirModalRetiro() {
    if (!this.cajaActual()) return;
    this.montoRetiroInput = 0;
    this.actualizarMontoDefault = false;
    this.mostrarModalRetiro.set(true);
  }

  cerrarModalRetiro() {
    this.mostrarModalRetiro.set(false);
  }

  async confirmarRetiro() {
    const caja = this.cajaActual();
    if (!caja) return;

    if (this.montoRetiroInput <= 0) {
      this.mostrarToast('Ingresa un monto válido', 'error');
      return;
    }

    if (this.montoRetiroInput > caja.monto_actual) {
      this.mostrarToast('No hay suficiente saldo en caja', 'error');
      return;
    }

    this.cargando.set(true);
    try {
      const usuario = await this.obtenerUsuarioActual();
      const saldoRestante = caja.monto_actual - this.montoRetiroInput;

      // 1. Insertar el Movimiento de Egreso (El retiro)
      const { error: errorMov } = await this.supabase.getClient()
        .from('movimientos_caja')
        .insert({
          caja_id: caja.id,
          tipo: 'egreso',
          concepto: 'Retiro de Caja',
          monto: this.montoRetiroInput,
          metodo: 'efectivo',
          usuario_id: usuario.id,
          usuario_nombre: usuario.nombre,
          observaciones: `Retiro manual. Quedan ${saldoRestante} en caja.`,
          created_at: new Date().toISOString()
        });

      if (errorMov) throw errorMov;

      // 2. Actualizar monto de la caja actual (Supabase lo hace via trigger o manual)
      // Actualizamos manual para asegurar consistencia inmediata si no hay trigger
      await this.supabase.getClient()
        .from('cajas')
        .update({ monto_actual: saldoRestante })
        .eq('id', caja.id);

      // 3. ACTUALIZAR CONFIGURACIÓN AUTOMÁTICA (El requerimiento clave)
      // Si el usuario quiere que el sobrante sea el nuevo estándar
      if (this.actualizarMontoDefault) {
        // Buscamos si existe config, si no, se crea o actualiza
        const config = this.configuracion();
        const configData = {
          monto_inicial_default: saldoRestante,
          updated_at: new Date().toISOString()
        };

        if (config) {
          await this.supabase.getClient()
            .from('configuracion_caja')
            .update(configData)
            .eq('id', config.id);
        } else {
          await this.supabase.getClient()
            .from('configuracion_caja')
            .insert(configData);
        }
        
        this.mostrarToast(`Retiro exitoso. Nuevo monto inicial por defecto: $${saldoRestante}`, 'success');
      } else {
        this.mostrarToast('Retiro registrado exitosamente', 'success');
      }

      this.cerrarModalRetiro();
      await this.cargarDatos(); // Recargar todo para ver reflejado el cambio

    } catch (error: any) {
      console.error('Error al retirar:', error);
      this.mostrarToast('Error al registrar retiro', 'error');
    } finally {
      this.cargando.set(false);
    }
  }
}