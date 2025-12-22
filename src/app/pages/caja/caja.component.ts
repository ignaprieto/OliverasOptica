/*import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { ThemeService } from '../../services/theme.service';
import { MonedaArsPipe } from '../../pipes/moneda-ars.pipe';

// Interfaces locales
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
  imports: [CommonModule, RouterModule, FormsModule, MonedaArsPipe],
  templateUrl: './caja.component.html',
  styleUrl: './caja.component.css'
})
export class CajaComponent implements OnInit, OnDestroy {
  // Estado de la caja
  cajaActual: Caja | null = null;
  movimientos: MovimientoCaja[] = [];
  configuracion: ConfiguracionCaja | null = null;
  
  // Historial
  historialCajas: Caja[] = [];
  cajaSeleccionadaHistorial: string | null = null;
  movimientosHistorial: MovimientoCaja[] = [];
paginaActualHistorial = 1;
cajasPorPagina = 5;
filtroFechaDesde: string = '';
filtroFechaHasta: string = '';
totalCajasHistorial = 0;

  // Formularios
  montoApertura: number = 0;
  montoCierre: number = 0;

  // Configuración
  configForm = {
    hora_apertura_auto: '08:00',
    hora_cierre_auto: '20:00',
    apertura_automatica_habilitada: false,
    cierre_automatico_habilitado: false,
    monto_inicial_default: 0
  };

  // UI States
  mostrarModalApertura = false;
  mostrarModalCierre = false;
  mostrarModalConfiguracion = false;
  mostrarHistorial = false;
  cargando = false;
  toastVisible = false;
  toastMensaje = '';
  toastColor = 'bg-green-600';

  // Resumen
  resumen = {
    totalIngresosEfectivo: 0,
    totalVueltos: 0,
    ventasEfectivo: 0,
    cantidadMovimientos: 0,
    diferencia: 0
  };

  // Filtros
  filtroTipo: 'todos' | 'ingreso' | 'egreso' = 'todos';

  // Exponer Math para el template
  Math = Math;
  cajaAbierta = false;

 mostrarMensajeCaja = true;

  private readonly MOVIMIENTOS_INICIALES = 50;
private todosMovimientosCargados = false;

  constructor(
    private supabase: SupabaseService,
    public themeService: ThemeService
  ) {}

async ngOnInit() {
  this.cargando = true;
  
  try {
    // Cargar solo lo esencial primero
    await this.obtenerCajaActual(); 
    
    // Si hay caja actual, cargar movimientos de inmediato
    if (this.cajaActual) {
      await this.cargarMovimientos();
      this.calcularResumen();
    }
    
    // Cargar configuración e historial en background
    this.cargarDatosSecundariosLazy();
    
  } catch (error) {
    console.error('Error al cargar datos:', error);
    this.mostrarToast('Error al cargar datos de caja', 'error');
  } finally {
    this.cargando = false;
  }
}

  ngOnDestroy() {
    // Limpiar si es necesario
  }

private cargarDatosSecundariosLazy() {
  setTimeout(() => {
    Promise.all([
      this.obtenerConfiguracion(),
      this.cargarHistorial()
    ]).catch(err => console.error('Error cargando datos secundarios:', err));
  }, 100);
}

  // ========== CARGA DE DATOS ==========

  async cargarDatos() {
    this.cargando = true;
    try {
      await Promise.all([
        this.obtenerCajaActual(),
        this.obtenerConfiguracion(),
        this.cargarHistorial()
      ]);
      
      if (this.cajaActual) {
        await this.cargarMovimientos();
        this.calcularResumen();
      }
    } catch (error) {
      console.error('Error al cargar datos:', error);
      this.mostrarToast('Error al cargar datos de caja', 'error');
    } finally {
      this.cargando = false;
    }
  }

async obtenerCajaActual() {
  const { data, error } = await this.supabase
    .getClient()
    .from('cajas')
    .select('*')
    .eq('estado', 'abierta')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!error && data) {
    this.cajaActual = data;
    this.montoCierre = data.monto_actual;
    this.cajaAbierta = true;
  } else {
    this.cajaActual = null;
    this.cajaAbierta = false;
  }

  this.mostrarMensajeCaja = true;
  setTimeout(() => {
    this.mostrarMensajeCaja = false;
  }, 3000);
}

  async obtenerConfiguracion() {
    const { data, error } = await this.supabase
      .getClient()
      .from('configuracion_caja')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      this.configuracion = data;
      this.configForm = {
        hora_apertura_auto: data.hora_apertura_auto || '08:00',
        hora_cierre_auto: data.hora_cierre_auto || '20:00',
        apertura_automatica_habilitada: data.apertura_automatica_habilitada || false,
        cierre_automatico_habilitado: data.cierre_automatico_habilitado || false,
        monto_inicial_default: data.monto_inicial_default || 0
      };
      this.montoApertura = data.monto_inicial_default || 0;
    }
  }

async cargarMovimientos() {
  if (!this.cajaActual) return;

  const { data, error } = await this.supabase
    .getClient()
    .from('movimientos_caja')
    .select('*')
    .eq('caja_id', this.cajaActual.id)
    .order('created_at', { ascending: false })
    .limit(this.MOVIMIENTOS_INICIALES);

  if (!error && data) {
    this.movimientos = data;
    this.todosMovimientosCargados = data.length < this.MOVIMIENTOS_INICIALES;
  }
}

async cargarMasMovimientos() {
  if (!this.cajaActual || this.todosMovimientosCargados) return;

  const { data, error } = await this.supabase
    .getClient()
    .from('movimientos_caja')
    .select('*')
    .eq('caja_id', this.cajaActual.id)
    .order('created_at', { ascending: false })
    .range(this.movimientos.length, this.movimientos.length + 49);

  if (!error && data) {
    this.movimientos = [...this.movimientos, ...data];
    this.todosMovimientosCargados = data.length < 50;
  }
}

async cargarHistorial() {
  try {
    let query = this.supabase
      .getClient()
      .from('cajas')
      .select('id, fecha_apertura, fecha_cierre, monto_inicial, monto_actual, monto_cierre, estado, usuario_apertura, usuario_cierre, apertura_manual, cierre_manual, hora_apertura_auto, hora_cierre_auto', { count: 'exact' });

    // Aplicar filtros de fecha
    if (this.filtroFechaDesde) {
      query = query.gte('fecha_apertura', new Date(this.filtroFechaDesde).toISOString());
    }
    if (this.filtroFechaHasta) {
      const fechaHasta = new Date(this.filtroFechaHasta);
      fechaHasta.setHours(23, 59, 59, 999);
      query = query.lte('fecha_apertura', fechaHasta.toISOString());
    }

    // Obtener total para paginación
    const { count } = await query;
    this.totalCajasHistorial = count || 0;

    // Aplicar paginación
    const inicio = (this.paginaActualHistorial - 1) * this.cajasPorPagina;
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .range(inicio, inicio + this.cajasPorPagina - 1);

    if (error) throw error;
    this.historialCajas = data || [];
  } catch (error) {
    console.error('Error al cargar historial:', error);
    this.mostrarToast('Error al cargar historial', 'error');
  }
}

get totalPaginasHistorial(): number {
  return Math.ceil(this.totalCajasHistorial / this.cajasPorPagina);
}

get paginasHistorial(): number[] {
  const paginas = [];
  const total = this.totalPaginasHistorial;
  const actual = this.paginaActualHistorial;
  
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
}

cambiarPaginaHistorial(pagina: number) {
  if (pagina >= 1 && pagina <= this.totalPaginasHistorial) {
    this.paginaActualHistorial = pagina;
    this.cargarHistorial();
  }
}

aplicarFiltroFechas() {
  this.paginaActualHistorial = 1;
  this.cargarHistorial();
}

limpiarFiltroFechas() {
  this.filtroFechaDesde = '';
  this.filtroFechaHasta = '';
  this.paginaActualHistorial = 1;
  this.cargarHistorial();
}

  // ========== APERTURA Y CIERRE ==========

  abrirModalApertura() {
    
    
    if (this.cajaActual) {
      this.mostrarToast('Ya existe una caja abierta', 'error');
      return;
    }

    // Si hay configuración con apertura automática, avisar
    if (this.configuracion?.apertura_automatica_habilitada) {
      
    }

    this.mostrarModalApertura = true;
    
  }

  cerrarModalApertura() {
    this.mostrarModalApertura = false;
  }

  async confirmarApertura() {
    
    
    if (this.montoApertura < 0) {
      this.mostrarToast('El monto inicial no puede ser negativo', 'error');
      return;
    }

    this.cargando = true;
    try {
      const usuario = await this.obtenerUsuarioActual();
     

      const nuevaCaja = {
        fecha_apertura: new Date().toISOString(),
        monto_inicial: this.montoApertura,
        monto_actual: this.montoApertura,
        estado: 'abierta' as const,
        usuario_apertura: usuario.nombre,
        apertura_manual: true,
        cierre_manual: false,
        hora_apertura_auto: this.configuracion?.hora_apertura_auto || null,
        hora_cierre_auto: this.configuracion?.hora_cierre_auto || null
      };

      

      const { data, error } = await this.supabase
        .getClient()
        .from('cajas')
        .insert(nuevaCaja)
        .select()
        .single();

      if (error) {
        console.error('Error de Supabase:', error);
        throw error;
      }

     
      this.mostrarToast('Caja abierta correctamente', 'success');
      this.mostrarModalApertura = false;
        this.cajaAbierta = true;
      await this.cargarDatos();
    } catch (error: any) {
      console.error('Error al abrir caja:', error);
      this.mostrarToast(error.message || 'Error al abrir caja', 'error');
    } finally {
      this.cargando = false;
    }
  }

  abrirModalCierre() {
    if (!this.cajaActual) {
      this.mostrarToast('No hay caja abierta', 'error');
      return;
    }
    this.montoCierre = this.cajaActual.monto_actual;
    this.mostrarModalCierre = true;
  }

  cerrarModalCierre() {
    this.mostrarModalCierre = false;
  }

  async confirmarCierre() {
    if (!this.cajaActual) return;

    this.cargando = true;
    try {
      const usuario = await this.obtenerUsuarioActual();
      const diferencia = this.montoCierre - this.cajaActual.monto_actual;

      // Cerrar caja
      const { error } = await this.supabase
        .getClient()
        .from('cajas')
        .update({
          fecha_cierre: new Date().toISOString(),
          monto_cierre: this.montoCierre,
          estado: 'cerrada',
          usuario_cierre: usuario.nombre,
          cierre_manual: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', this.cajaActual.id);

      if (error) throw error;

      // Si hay diferencia, registrarla
      if (diferencia !== 0) {
        await this.supabase
          .getClient()
          .from('movimientos_caja')
          .insert({
            caja_id: this.cajaActual.id,
            tipo: diferencia > 0 ? 'ingreso' : 'egreso',
            concepto: diferencia > 0 ? 'Ajuste positivo al cierre' : 'Ajuste negativo al cierre',
            monto: Math.abs(diferencia),
            metodo: 'efectivo',
            usuario_id: usuario.id,
            usuario_nombre: usuario.nombre,
            observaciones: `Diferencia: ${diferencia.toFixed(2)} - Cierre manual`,
            created_at: new Date().toISOString()
          });
      }

      this.mostrarToast('Caja cerrada correctamente', 'success');
      this.mostrarModalCierre = false;
        this.cajaAbierta = false;
      await this.cargarDatos();
    } catch (error: any) {
      console.error('Error al cerrar caja:', error);
      this.mostrarToast(error.message || 'Error al cerrar caja', 'error');
    } finally {
      this.cargando = false;
    }
  }

  // ========== CONFIGURACIÓN ==========

  abrirModalConfiguracion() {
    
    
    // Cargar la configuración actual en el formulario
    if (this.configuracion) {
      this.configForm = {
        hora_apertura_auto: this.configuracion.hora_apertura_auto || '08:00',
        hora_cierre_auto: this.configuracion.hora_cierre_auto || '20:00',
        apertura_automatica_habilitada: this.configuracion.apertura_automatica_habilitada || false,
        cierre_automatico_habilitado: this.configuracion.cierre_automatico_habilitado || false,
        monto_inicial_default: this.configuracion.monto_inicial_default || 0
      };
    }
    
    this.mostrarModalConfiguracion = true;
  
  }

  cerrarModalConfiguracion() {
    this.mostrarModalConfiguracion = false;
  }

// Agregar estos métodos al CajaComponent existente

// ========== MÉTODOS PARA CRON ==========

async guardarConfiguracion() {
  
  this.cargando = true;
  try {
    const configData = {
      ...this.configForm,
      updated_at: new Date().toISOString()
    };

    if (this.configuracion) {
      // Actualizar
      const { error } = await this.supabase
        .getClient()
        .from('configuracion_caja')
        .update(configData)
        .eq('id', this.configuracion.id);

      if (error) throw error;
    } else {
      // Crear
      const { error } = await this.supabase
        .getClient()
        .from('configuracion_caja')
        .insert(configData);

      if (error) throw error;
    }

    // IMPORTANTE: Actualizar los horarios de cron automáticamente
    await this.actualizarHorariosCron();

    this.mostrarToast('Configuración guardada y horarios actualizados', 'success');
    this.mostrarModalConfiguracion = false;
    await this.obtenerConfiguracion();
  } catch (error) {
    console.error('Error al guardar configuración:', error);
    this.mostrarToast('Error al guardar configuración', 'error');
  } finally {
    this.cargando = false;
  }
}


async actualizarHorariosCron(): Promise<void> {
  try {
    
    const { data, error } = await this.supabase
      .getClient()
      .rpc('actualizar_horarios_cron');

    if (error) {
      console.error('Error al actualizar horarios de cron:', error);
      throw error;
    }

    
    if (data && data.success) {
      // Mostrar información de los jobs configurados
      const acciones = data.acciones || [];
    }
  } catch (error: any) {
    console.error('Error al llamar actualizar_horarios_cron:', error);
    throw error;
  }
}


async verificarEstadoCron(): Promise<void> {
  try {
    // Consultar directamente la tabla cron.job
    const { data, error } = await this.supabase
      .getClient()
      .from('cron.job')
      .select('*')
      .in('jobname', ['apertura-automatica-caja', 'cierre-automatico-caja']);

    if (error) {
      console.error('Error al verificar estado de cron:', error);
      return;
    }

  } catch (error) {
    console.error('Error al verificar cron:', error);
  }
}


async probarAperturaAutomatica(): Promise<void> {
  if (!confirm('¿Deseas probar la apertura automática? Esto abrirá una caja si no existe una hoy.')) {
    return;
  }

  this.cargando = true;
  try {
    const { data, error } = await this.supabase
      .getClient()
      .rpc('apertura_automatica_caja');

    if (error) throw error;

    
    if (data.success) {
      this.mostrarToast(`✅ ${data.mensaje}`, 'success');
    } else {
      this.mostrarToast(`ℹ️ ${data.mensaje}`, 'error');
    }
    
    await this.cargarDatos();
  } catch (error: any) {
    console.error('Error en prueba:', error);
    this.mostrarToast(error.message || 'Error en prueba de apertura', 'error');
  } finally {
    this.cargando = false;
  }
}

async probarCierreAutomatico(): Promise<void> {
  if (!confirm('¿Deseas probar el cierre automático? Esto cerrará la caja actual si está abierta.')) {
    return;
  }

  this.cargando = true;
  try {
    const { data, error } = await this.supabase
      .getClient()
      .rpc('cierre_automatico_caja');

    if (error) throw error;

    
    if (data.success) {
      this.mostrarToast(`✅ ${data.mensaje}`, 'success');
    } else {
      this.mostrarToast(`ℹ️ ${data.mensaje}`, 'error');
    }
    
    await this.cargarDatos();
  } catch (error: any) {
    console.error('Error en prueba:', error);
    this.mostrarToast(error.message || 'Error en prueba de cierre', 'error');
  } finally {
    this.cargando = false;
  }
}


async desactivarCronJobs(): Promise<void> {
  if (!confirm('¿Deseas desactivar los cron jobs? Deberás reactivarlos manualmente.')) {
    return;
  }

  this.cargando = true;
  try {
    const { data, error } = await this.supabase
      .getClient()
      .rpc('desactivar_cron_caja');

    if (error) throw error;

    
    if (data.success) {
      this.mostrarToast('Cron jobs desactivados', 'success');
    } else {
      this.mostrarToast(data.mensaje || 'Error al desactivar', 'error');
    }
  } catch (error: any) {
    console.error('Error al desactivar cron:', error);
    this.mostrarToast(error.message || 'Error al desactivar cron jobs', 'error');
  } finally {
    this.cargando = false;
  }
}


async verProximasEjecuciones(): Promise<void> {
  try {
    const { data, error } = await this.supabase
      .getClient()
      .rpc('ver_proximas_ejecuciones_caja');

    if (error) throw error;
    
    if (data && data.length > 0) {
      let mensaje = 'Próximas ejecuciones programadas:\n\n';
      data.forEach((job: any) => {
        mensaje += `${job.job_name}: ${job.schedule}\n`;
      });
      alert(mensaje);
    } else {
      this.mostrarToast('No hay ejecuciones programadas', 'error');
    }
  } catch (error: any) {
    console.error('Error al ver próximas ejecuciones:', error);
    this.mostrarToast('Error al obtener información', 'error');
  }
}

  // ========== UTILIDADES ==========

  calcularResumen() {
    // Total de efectivo ingresado (dinero que dio el cliente)
    // Incluye: efectivo recibido directamente + recambios/diferencias en efectivo
    this.resumen.totalIngresosEfectivo = this.movimientos
      .filter(m => 
        m.tipo === 'ingreso' && 
        m.metodo === 'efectivo' && 
        (m.concepto === 'Efectivo recibido' || 
         m.concepto.includes('Recambio') || 
         m.concepto.includes('Diferencia'))
      )
      .reduce((acc, m) => acc + m.monto, 0);

    // Total de vueltos entregados
    this.resumen.totalVueltos = this.movimientos
      .filter(m => m.tipo === 'egreso' && m.concepto === 'Vuelto entregado')
      .reduce((acc, m) => acc + m.monto, 0);

    // Ventas efectivo reales (lo que quedó después de dar vuelto)
    this.resumen.ventasEfectivo = this.resumen.totalIngresosEfectivo - this.resumen.totalVueltos;

    this.resumen.cantidadMovimientos = this.movimientos.length;

    if (this.cajaActual) {
      this.resumen.diferencia = this.montoCierre - this.cajaActual.monto_actual;
    }
  }

  movimientosFiltrados(): MovimientoCaja[] {
    return this.movimientos.filter(m => {
      if (this.filtroTipo !== 'todos' && m.tipo !== this.filtroTipo) {
        return false;
      }
      return true;
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

    // Validar que usuario no sea null
    if (!usuario) {
      throw new Error('No se pudo obtener el usuario actual');
    }

    // Verificar si tiene user_metadata (usuario de Supabase)
    if ('user_metadata' in usuario && usuario.user_metadata) {
      return {
        id: usuario.id || 'unknown',
        nombre: usuario.user_metadata['nombre'] || 'Desconocido'
      };
    } 
    
    // Si es vendedor temp o del localStorage
    if ('id' in usuario && 'nombre' in usuario) {
      return {
        id: (usuario as any).id || 'unknown',
        nombre: (usuario as any).nombre || 'Desconocido'
      };
    }

    // Fallback
    return {
      id: 'unknown',
      nombre: 'Desconocido'
    };
  }

  mostrarToast(mensaje: string, tipo: 'success' | 'error') {
    this.toastMensaje = mensaje;
    this.toastColor = tipo === 'success' ? 'bg-green-600' : 'bg-red-600';
    this.toastVisible = true;
    setTimeout(() => {
      this.toastVisible = false;
    }, 3000);
  }

  // ========== FORMATEO DE FECHAS ==========

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

  // ========== MÉTODOS PARA EL HISTORIAL ==========

  async toggleMovimientosHistorial(cajaId: string): Promise<void> {
    if (this.cajaSeleccionadaHistorial === cajaId) {
      this.cajaSeleccionadaHistorial = null;
      this.movimientosHistorial = [];
    } else {
      this.cajaSeleccionadaHistorial = cajaId;
      await this.cargarMovimientosHistorial(cajaId);
    }
  }

  async cargarMovimientosHistorial(cajaId: string): Promise<void> {
    try {
      const { data, error } = await this.supabase
        .getClient()
        .from('movimientos_caja')
        .select('*')
        .eq('caja_id', cajaId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      this.movimientosHistorial = data || [];
    } catch (error) {
      console.error('Error al cargar movimientos del historial:', error);
      this.mostrarToast('Error al cargar movimientos', 'error');
      this.movimientosHistorial = [];
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
}*/

import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { ThemeService } from '../../services/theme.service';
import { MonedaArsPipe } from '../../pipes/moneda-ars.pipe';

// ... (Las interfaces se mantienen igual) ...
// Interfaces locales
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
  imports: [CommonModule, RouterModule, FormsModule, MonedaArsPipe],
  templateUrl: './caja.component.html',
  styleUrl: './caja.component.css'
})
export class CajaComponent implements OnInit, OnDestroy {
  // Estado de la caja
  cajaActual: Caja | null = null;
  movimientos: MovimientoCaja[] = [];
  configuracion: ConfiguracionCaja | null = null;
  
  // Historial
  historialCajas: Caja[] = [];
  cajaSeleccionadaHistorial: string | null = null;
  movimientosHistorial: MovimientoCaja[] = [];
  paginaActualHistorial = 1;
  cajasPorPagina = 5;
  filtroFechaDesde: string = '';
  filtroFechaHasta: string = '';
  totalCajasHistorial = 0;

  // Formularios
  montoApertura: number = 0;
  montoCierre: number = 0;

  // Configuración
  configForm = {
    hora_apertura_auto: '08:00',
    hora_cierre_auto: '20:00',
    apertura_automatica_habilitada: false,
    cierre_automatico_habilitado: false,
    monto_inicial_default: 0
  };

  // UI States
  mostrarModalApertura = false;
  mostrarModalCierre = false;
  mostrarModalConfiguracion = false;
  mostrarHistorial = false;
  cargando = false;
  toastVisible = false;
  toastMensaje = '';
  toastColor = 'bg-green-600';

  // Resumen
  resumen = {
    totalIngresosEfectivo: 0,
    totalVueltos: 0,
    ventasEfectivo: 0,
    cantidadMovimientos: 0,
    diferencia: 0
  };

  // Filtros
  filtroTipo: 'todos' | 'ingreso' | 'egreso' = 'todos';

  // Exponer Math para el template
  Math = Math;
  cajaAbierta = false;
  
  // NUEVO: Bandera para detectar cajas olvidadas
  cajaDeFechaAnterior = false; 

  mostrarMensajeCaja = true;

  private readonly MOVIMIENTOS_INICIALES = 50;
  todosMovimientosCargados = false;

  constructor(
    private supabase: SupabaseService,
    public themeService: ThemeService
  ) {}

  async ngOnInit() {
    this.cargando = true;
    try {
      // 1. Cargar Configuración primero para tener los defaults
      await this.obtenerConfiguracion();

      // 2. Cargar Caja Actual
      await this.obtenerCajaActual(); 
      
      // 3. Si hay caja actual, cargar movimientos
      if (this.cajaActual) {
        await this.cargarMovimientos();
        this.calcularResumen();
      }
      
      // 4. Historial en background
      this.cargarHistorial();
      
    } catch (error) {
      console.error('Error al cargar datos:', error);
      this.mostrarToast('Error al cargar datos de caja', 'error');
    } finally {
      this.cargando = false;
    }
  }

  ngOnDestroy() {
    // Limpieza si fuera necesaria
  }

  // ========== CARGA DE DATOS ==========

  async cargarDatos() {
    this.cargando = true;
    try {
      await Promise.all([
        this.obtenerCajaActual(),
        this.obtenerConfiguracion(),
        this.cargarHistorial()
      ]);
      
      if (this.cajaActual) {
        await this.cargarMovimientos();
        this.calcularResumen();
      }
    } catch (error) {
      console.error('Error al cargar datos:', error);
      this.mostrarToast('Error al cargar datos de caja', 'error');
    } finally {
      this.cargando = false;
    }
  }

  async obtenerCajaActual() {
    const { data, error } = await this.supabase
      .getClient()
      .from('cajas')
      .select('*')
      .eq('estado', 'abierta')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      this.cajaActual = data;
      this.montoCierre = data.monto_actual;
      this.cajaAbierta = true;

      // === LÓGICA DE DETECCIÓN DE FECHA INCORRECTA ===
      const fechaCaja = new Date(data.fecha_apertura);
      const hoy = new Date();
      
      // Comparamos día, mes y año para saber si es de hoy
      const esMismoDia = fechaCaja.getDate() === hoy.getDate() &&
                         fechaCaja.getMonth() === hoy.getMonth() &&
                         fechaCaja.getFullYear() === hoy.getFullYear();

      if (!esMismoDia) {
        // 1. Activamos el banner rojo
        this.cajaDeFechaAnterior = true;
        
        // 2. IMPORTANTE: ELIMINAMOS la línea 'this.mostrarToast(...)' para que no salga el mensaje de abajo.
        
        // 3. Agregamos el temporizador para que desaparezca a los 6 segundos
        setTimeout(() => {
          this.cajaDeFechaAnterior = false; // Al pasar a false, el HTML lo oculta automáticamente
        }, 6000);

      } else {
        this.cajaDeFechaAnterior = false;
      }
      // ===============================================

    } else {
      this.cajaActual = null;
      this.cajaAbierta = false;
      this.cajaDeFechaAnterior = false;
    }

    // Mensaje de carga inicial "Cargando datos..." (Opcional)
    this.mostrarMensajeCaja = true;
    setTimeout(() => {
      this.mostrarMensajeCaja = false;
    }, 3000);
  }

  async obtenerConfiguracion() {
    const { data, error } = await this.supabase
      .getClient()
      .from('configuracion_caja')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      this.configuracion = data;
      this.configForm = {
        hora_apertura_auto: data.hora_apertura_auto || '08:00',
        hora_cierre_auto: data.hora_cierre_auto || '20:00',
        apertura_automatica_habilitada: data.apertura_automatica_habilitada || false,
        cierre_automatico_habilitado: data.cierre_automatico_habilitado || false,
        monto_inicial_default: data.monto_inicial_default || 0
      };
      // Solo sugerir monto default si no hay caja abierta
      if (!this.cajaAbierta) {
        this.montoApertura = data.monto_inicial_default || 0;
      }
    }
  }

  async cargarMovimientos() {
    if (!this.cajaActual) return;

    const { data, error } = await this.supabase
      .getClient()
      .from('movimientos_caja')
      .select('*')
      .eq('caja_id', this.cajaActual.id)
      .order('created_at', { ascending: false })
      .limit(this.MOVIMIENTOS_INICIALES);

    if (!error && data) {
      this.movimientos = data;
      this.todosMovimientosCargados = data.length < this.MOVIMIENTOS_INICIALES;
    }
  }

  async cargarMasMovimientos() {
    if (!this.cajaActual || this.todosMovimientosCargados) return;

    const { data, error } = await this.supabase
      .getClient()
      .from('movimientos_caja')
      .select('*')
      .eq('caja_id', this.cajaActual.id)
      .order('created_at', { ascending: false })
      .range(this.movimientos.length, this.movimientos.length + 49);

    if (!error && data) {
      this.movimientos = [...this.movimientos, ...data];
      this.todosMovimientosCargados = data.length < 50;
    }
  }

  // ... (Métodos de Historial se mantienen igual: cargarHistorial, cambiarPagina, filtros) ...
  async cargarHistorial() {
    try {
      let query = this.supabase
        .getClient()
        .from('cajas')
        .select('*', { count: 'exact' }); // Simplificado para selects

      // Aplicar filtros de fecha
      if (this.filtroFechaDesde) {
        query = query.gte('fecha_apertura', new Date(this.filtroFechaDesde).toISOString());
      }
      if (this.filtroFechaHasta) {
        const fechaHasta = new Date(this.filtroFechaHasta);
        fechaHasta.setHours(23, 59, 59, 999);
        query = query.lte('fecha_apertura', fechaHasta.toISOString());
      }

      const { count } = await query;
      this.totalCajasHistorial = count || 0;

      const inicio = (this.paginaActualHistorial - 1) * this.cajasPorPagina;
      const { data, error } = await query
        .order('created_at', { ascending: false })
        .range(inicio, inicio + this.cajasPorPagina - 1);

      if (error) throw error;
      this.historialCajas = data || [];
    } catch (error) {
      console.error('Error al cargar historial:', error);
    }
  }

  get totalPaginasHistorial(): number {
    return Math.ceil(this.totalCajasHistorial / this.cajasPorPagina);
  }
  
  // (Mantener get paginasHistorial, cambiarPaginaHistorial, filtros...)
  get paginasHistorial(): number[] {
    const paginas = [];
    const total = this.totalPaginasHistorial;
    const actual = this.paginaActualHistorial;
    
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
  }

  cambiarPaginaHistorial(pagina: number) {
    if (pagina >= 1 && pagina <= this.totalPaginasHistorial) {
      this.paginaActualHistorial = pagina;
      this.cargarHistorial();
    }
  }

  aplicarFiltroFechas() {
    this.paginaActualHistorial = 1;
    this.cargarHistorial();
  }

  limpiarFiltroFechas() {
    this.filtroFechaDesde = '';
    this.filtroFechaHasta = '';
    this.paginaActualHistorial = 1;
    this.cargarHistorial();
  }


  // ========== APERTURA Y CIERRE ==========

  abrirModalApertura() {
    if (this.cajaActual) {
      this.mostrarToast('Ya existe una caja abierta', 'error');
      return;
    }
    // Asegurarse de usar la fecha y hora local correcta
    this.mostrarModalApertura = true;
  }

  cerrarModalApertura() {
    this.mostrarModalApertura = false;
  }

  async confirmarApertura() {
    if (this.montoApertura < 0) {
      this.mostrarToast('El monto inicial no puede ser negativo', 'error');
      return;
    }

    this.cargando = true;
    try {
      const usuario = await this.obtenerUsuarioActual();
      
      // Fecha actual ISO asegurando zona horaria local si fuera necesario, 
      // pero new Date().toISOString() guarda en UTC lo cual es estándar.
      const ahora = new Date();

      const nuevaCaja = {
        fecha_apertura: ahora.toISOString(),
        monto_inicial: this.montoApertura,
        monto_actual: this.montoApertura,
        estado: 'abierta' as const,
        usuario_apertura: usuario.nombre,
        apertura_manual: true,
        cierre_manual: false,
        hora_apertura_auto: this.configuracion?.hora_apertura_auto || null,
        hora_cierre_auto: this.configuracion?.hora_cierre_auto || null
      };

      const { error } = await this.supabase
        .getClient()
        .from('cajas')
        .insert(nuevaCaja)
        .select()
        .single();

      if (error) throw error;

      this.mostrarToast('Caja abierta correctamente', 'success');
      this.mostrarModalApertura = false;
      this.cajaAbierta = true;
      await this.cargarDatos();
    } catch (error: any) {
      console.error('Error al abrir caja:', error);
      this.mostrarToast(error.message || 'Error al abrir caja', 'error');
    } finally {
      this.cargando = false;
    }
  }

  abrirModalCierre() {
    if (!this.cajaActual) {
      this.mostrarToast('No hay caja abierta', 'error');
      return;
    }
    this.montoCierre = this.cajaActual.monto_actual;
    this.mostrarModalCierre = true;
  }

  cerrarModalCierre() {
    this.mostrarModalCierre = false;
  }

  async confirmarCierre() {
    if (!this.cajaActual) return;

    this.cargando = true;
    try {
      const usuario = await this.obtenerUsuarioActual();
      const diferencia = this.montoCierre - this.cajaActual.monto_actual;

      // Cerrar caja
      const { error } = await this.supabase
        .getClient()
        .from('cajas')
        .update({
          fecha_cierre: new Date().toISOString(),
          monto_cierre: this.montoCierre,
          estado: 'cerrada',
          usuario_cierre: usuario.nombre,
          cierre_manual: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', this.cajaActual.id);

      if (error) throw error;

      // Si hay diferencia, registrarla
      if (diferencia !== 0) {
        await this.supabase
          .getClient()
          .from('movimientos_caja')
          .insert({
            caja_id: this.cajaActual.id,
            tipo: diferencia > 0 ? 'ingreso' : 'egreso',
            concepto: diferencia > 0 ? 'Ajuste positivo al cierre' : 'Ajuste negativo al cierre',
            monto: Math.abs(diferencia),
            metodo: 'efectivo',
            usuario_id: usuario.id,
            usuario_nombre: usuario.nombre,
            observaciones: `Diferencia: ${diferencia.toFixed(2)} - Cierre manual`,
            created_at: new Date().toISOString()
          });
      }

      this.mostrarToast('Caja cerrada correctamente', 'success');
      this.mostrarModalCierre = false;
      this.cajaAbierta = false;
      this.cajaDeFechaAnterior = false; // Resetear alerta
      await this.cargarDatos();
    } catch (error: any) {
      console.error('Error al cerrar caja:', error);
      this.mostrarToast(error.message || 'Error al cerrar caja', 'error');
    } finally {
      this.cargando = false;
    }
  }

  // ========== CONFIGURACIÓN ==========

  abrirModalConfiguracion() {
    // Cargar la configuración actual en el formulario
    if (this.configuracion) {
      this.configForm = {
        hora_apertura_auto: this.configuracion.hora_apertura_auto || '08:00',
        hora_cierre_auto: this.configuracion.hora_cierre_auto || '20:00',
        apertura_automatica_habilitada: this.configuracion.apertura_automatica_habilitada || false,
        cierre_automatico_habilitado: this.configuracion.cierre_automatico_habilitado || false,
        monto_inicial_default: this.configuracion.monto_inicial_default || 0
      };
    }
    this.mostrarModalConfiguracion = true;
  }

  cerrarModalConfiguracion() {
    this.mostrarModalConfiguracion = false;
  }

  async guardarConfiguracion() {
    this.cargando = true;
    try {
      const configData = {
        ...this.configForm,
        updated_at: new Date().toISOString()
      };

      if (this.configuracion) {
        // Actualizar
        const { error } = await this.supabase
          .getClient()
          .from('configuracion_caja')
          .update(configData)
          .eq('id', this.configuracion.id);

        if (error) throw error;
      } else {
        // Crear
        const { error } = await this.supabase
          .getClient()
          .from('configuracion_caja')
          .insert(configData);

        if (error) throw error;
      }

      // IMPORTANTE: Aseguramos que la base de datos se entere
      // que debe apagar o encender los CRON JOBS
      await this.actualizarHorariosCron();

      this.mostrarToast('Configuración guardada.', 'success');
      this.mostrarModalConfiguracion = false;
      await this.obtenerConfiguracion();
    } catch (error) {
      console.error('Error al guardar configuración:', error);
      this.mostrarToast('Error al guardar configuración', 'error');
    } finally {
      this.cargando = false;
    }
  }

  async actualizarHorariosCron(): Promise<void> {
    try {
      // Esta llamada RPC es la clave para que la BD deje de abrir cajas solas
      const { data, error } = await this.supabase
        .getClient()
        .rpc('actualizar_horarios_cron');

      if (error) {
        console.error('Error al actualizar horarios de cron:', error);
        // No lanzamos error fatal, pero avisamos
        this.mostrarToast('Configuración guardada, pero hubo un error actualizando la automatización.', 'error');
      }
    } catch (error: any) {
      console.error('Error al llamar actualizar_horarios_cron:', error);
    }
  }

  // ========== UTILIDADES ==========

  calcularResumen() {
    // Total de efectivo ingresado (dinero que dio el cliente)
    this.resumen.totalIngresosEfectivo = this.movimientos
      .filter(m => 
        m.tipo === 'ingreso' && 
        m.metodo === 'efectivo' && 
        (m.concepto === 'Efectivo recibido' || 
         m.concepto.includes('Recambio') || 
         m.concepto.includes('Diferencia'))
      )
      .reduce((acc, m) => acc + m.monto, 0);

    // Total de vueltos entregados
    this.resumen.totalVueltos = this.movimientos
      .filter(m => m.tipo === 'egreso' && m.concepto === 'Vuelto entregado')
      .reduce((acc, m) => acc + m.monto, 0);

    // Ventas efectivo reales (lo que quedó después de dar vuelto)
    this.resumen.ventasEfectivo = this.resumen.totalIngresosEfectivo - this.resumen.totalVueltos;

    this.resumen.cantidadMovimientos = this.movimientos.length;

    if (this.cajaActual) {
      this.resumen.diferencia = this.montoCierre - this.cajaActual.monto_actual;
    }
  }

  movimientosFiltrados(): MovimientoCaja[] {
    return this.movimientos.filter(m => {
      if (this.filtroTipo !== 'todos' && m.tipo !== this.filtroTipo) {
        return false;
      }
      return true;
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

  mostrarToast(mensaje: string, tipo: 'success' | 'error') {
    this.toastMensaje = mensaje;
    this.toastColor = tipo === 'success' ? 'bg-green-600' : 'bg-red-600';
    this.toastVisible = true;
    setTimeout(() => {
      this.toastVisible = false;
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
    if (this.cajaSeleccionadaHistorial === cajaId) {
      this.cajaSeleccionadaHistorial = null;
      this.movimientosHistorial = [];
    } else {
      this.cajaSeleccionadaHistorial = cajaId;
      await this.cargarMovimientosHistorial(cajaId);
    }
  }

  async cargarMovimientosHistorial(cajaId: string): Promise<void> {
    try {
      const { data, error } = await this.supabase
        .getClient()
        .from('movimientos_caja')
        .select('*')
        .eq('caja_id', cajaId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      this.movimientosHistorial = data || [];
    } catch (error) {
      console.error('Error al cargar movimientos del historial:', error);
      this.mostrarToast('Error al cargar movimientos', 'error');
      this.movimientosHistorial = [];
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
}