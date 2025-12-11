import { Component, OnInit, OnDestroy } from '@angular/core';
import { SupabaseService } from '../../services/supabase.service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MonedaArsPipe } from '../../pipes/moneda-ars.pipe';
import { ThemeService } from '../../services/theme.service';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

@Component({
  selector: 'app-finanzas',
  standalone: true,
  imports: [FormsModule, CommonModule, RouterModule, MonedaArsPipe],
  templateUrl: './finanzas.component.html',
  styleUrl: './finanzas.component.css',
})
export class FinanzasComponent implements OnInit, OnDestroy {
  // Formulario
  fecha: string = new Date().toISOString().substring(0, 10);
  categoria: string = '';
  descripcion: string = '';
  monto: number = 0;
  // 1️⃣ NUEVO: Método de pago en formulario
  metodoPago: 'efectivo' | 'transferencia' | 'tarjeta' | 'otro' = 'efectivo';

  // Datos Visuales
  gastos: any[] = [];
  editandoId: string | null = null;

  // Filtros
  tipoFiltroFecha: 'mes' | 'dia' = 'mes';
  filtroMes: string = new Date().toISOString().substring(0, 7);
  filtroDia: string = new Date().toISOString().substring(0, 10);
  // 2️⃣ NUEVO: Filtro en tabla
  filtroMetodoPago: 'todos' | 'efectivo' | 'transferencia' | 'tarjeta' | 'otro' = 'todos';

  // Buscador
  private _filtroCategoria: string = '';
  private searchSubject = new Subject<string>();
  private searchSubscription: Subscription | null = null;

  get filtroCategoria(): string { return this._filtroCategoria; }
  set filtroCategoria(val: string) {
    this._filtroCategoria = val;
    this.searchSubject.next(val);
  }

  // === ESTADÍSTICAS ===
  balancePeriodo = {
    ventas: 0,
    gastos: 0,
    ganancia: 0
  };

  statsGlobales = {
    gananciaAnual: 0,
    promedioGananciaMensual: 0,
    gananciaHistorica: 0,
    gastosAnual: 0,
    promedioGastosMensual: 0,
    gastosHistorico: 0
  }

  // UI
  mostrarModal = false;
  gastoAEliminar: string | null = null;
  cargandoTabla = false;
  cargandoStats = false;

  // Paginación
  paginaActual = 1;
  itemsPorPagina = 10;
  totalRegistros = 0;

  // Toast
  toastVisible = false;
  toastcolor = 'bg-green-600';
  toastMensaje = '';
  toastTipo: 'success' | 'error' = 'success';
  toastTimeout: any = null;

  constructor(private supabase: SupabaseService, public themeService: ThemeService) {}

  async ngOnInit() {
    this.searchSubscription = this.searchSubject.pipe(
      debounceTime(500),
      distinctUntilChanged()
    ).subscribe(() => {
      this.paginaActual = 1;
      this.cargarListaGastos();
    });

    // Carga inicial
    await this.actualizarTodo();
  }

  ngOnDestroy() {
    if (this.searchSubscription) this.searchSubscription.unsubscribe();
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
  }

  async actualizarTodo() {
    await Promise.all([
      this.cargarBalancePeriodo(),
      this.cargarEstadisticasGlobales(),
      this.cargarListaGastos()
    ]);
  }

  // ================================================================
  //  LÓGICA DE USUARIO
  // ================================================================
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

    if (!usuario) throw new Error('No se pudo obtener el usuario actual');

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

    return { id: 'unknown', nombre: 'Desconocido' };
  }

  // ================================================================
  //  CÁLCULOS Y DATOS
  // ================================================================

  private obtenerRangoFechas(): { inicio: string, fin: string } {
    if (this.tipoFiltroFecha === 'dia') {
      return {
        inicio: `${this.filtroDia}T00:00:00`,
        fin: `${this.filtroDia}T23:59:59`
      };
    } else {
      const [year, month] = this.filtroMes.split('-').map(Number);
      const inicio = `${this.filtroMes}-01T00:00:00`;
      const finMesDate = new Date(year, month, 0); 
      const fin = `${year}-${String(month).padStart(2, '0')}-${finMesDate.getDate()}T23:59:59`;
      return { inicio, fin };
    }
  }

  cambiarFiltroFecha() {
    this.paginaActual = 1;
    this.cargarBalancePeriodo();
    this.cargarListaGastos();
  }

  cambiarFiltroMetodo() {
    this.paginaActual = 1;
    this.cargarListaGastos();
  }

  async cargarBalancePeriodo() {
    const { inicio, fin } = this.obtenerRangoFechas();
    const client = this.supabase.getClient();

    try {
      const [gastosRes, ventasRes, recambiosRes] = await Promise.all([
        client.from('gastos').select('monto').gte('fecha', inicio).lte('fecha', fin),
        client.from('ventas').select('total_final').gte('fecha_venta', inicio).lte('fecha_venta', fin),
        client.from('recambios').select('diferencia_abonada').gte('fecha_recambio', inicio).lte('fecha_recambio', fin)
      ]);

      const sumaGastos = (gastosRes.data || []).reduce((acc, g) => acc + Number(g.monto), 0);
      const sumaVentas = (ventasRes.data || []).reduce((acc, v) => acc + Number(v.total_final), 0);
      const sumaRecambios = (recambiosRes.data || []).reduce((acc, r) => acc + Number(r.diferencia_abonada), 0);
      
      this.balancePeriodo.gastos = sumaGastos;
      this.balancePeriodo.ventas = sumaVentas + sumaRecambios;
      this.balancePeriodo.ganancia = this.balancePeriodo.ventas - this.balancePeriodo.gastos;

    } catch (error) {
      console.error('Error balance periodo:', error);
    }
  }

  async cargarEstadisticasGlobales() {
    this.cargandoStats = true;
    const client = this.supabase.getClient();
    const year = new Date().getFullYear().toString();
    const inicioAnio = `${year}-01-01T00:00:00`;
    const finAnio = `${year}-12-31T23:59:59`;

    try {
      const [
        gastosAnual, ventasAnual, recambiosAnual,
        gastosHist, ventasHist, recambiosHist
      ] = await Promise.all([
        client.from('gastos').select('monto').gte('fecha', inicioAnio).lte('fecha', finAnio),
        client.from('ventas').select('total_final').gte('fecha_venta', inicioAnio).lte('fecha_venta', finAnio),
        client.from('recambios').select('diferencia_abonada').gte('fecha_recambio', inicioAnio).lte('fecha_recambio', finAnio),
        client.from('gastos').select('monto'),
        client.from('ventas').select('total_final'),
        client.from('recambios').select('diferencia_abonada')
      ]);

      const gAnual = (gastosAnual.data || []).reduce((acc, i) => acc + Number(i.monto), 0);
      const vAnual = (ventasAnual.data || []).reduce((acc, i) => acc + Number(i.total_final), 0);
      const rAnual = (recambiosAnual.data || []).reduce((acc, i) => acc + Number(i.diferencia_abonada), 0);
      const mesActual = new Date().getMonth() + 1;

      this.statsGlobales.gastosAnual = gAnual;
      this.statsGlobales.promedioGastosMensual = mesActual > 0 ? (gAnual / mesActual) : 0;
      this.statsGlobales.gananciaAnual = (vAnual + rAnual) - gAnual;
      this.statsGlobales.promedioGananciaMensual = mesActual > 0 ? (this.statsGlobales.gananciaAnual / mesActual) : 0;

      const gHist = (gastosHist.data || []).reduce((acc, i) => acc + Number(i.monto), 0);
      const vHist = (ventasHist.data || []).reduce((acc, i) => acc + Number(i.total_final), 0);
      const rHist = (recambiosHist.data || []).reduce((acc, i) => acc + Number(i.diferencia_abonada), 0);

      this.statsGlobales.gastosHistorico = gHist;
      this.statsGlobales.gananciaHistorica = (vHist + rHist) - gHist;

    } catch (error) {
      console.error('Error calculando stats globales:', error);
    } finally {
      this.cargandoStats = false;
    }
  }

  async cargarListaGastos() {
    this.cargandoTabla = true;
    const from = (this.paginaActual - 1) * this.itemsPorPagina;
    const to = from + this.itemsPorPagina - 1;
    const { inicio, fin } = this.obtenerRangoFechas();

    try {
      let query = this.supabase.getClient()
        .from('gastos')
        // 3️⃣ INCLUIMOS metodo_pago EN EL SELECT
        .select('id, fecha, categoria, descripcion, monto, metodo_pago', { count: 'exact' })
        .gte('fecha', inicio)
        .lte('fecha', fin)
        .order('fecha', { ascending: false });

      // 4️⃣ FILTRO POR METODO PAGO
      if (this.filtroMetodoPago !== 'todos') {
        query = query.eq('metodo_pago', this.filtroMetodoPago);
      }

      if (this.filtroCategoria.trim()) {
        const termino = this.filtroCategoria.trim();
        query = query.or(`categoria.ilike.%${termino}%,descripcion.ilike.%${termino}%`);
      }

      const { data, error, count } = await query.range(from, to);

      if (error) throw error;

      // Procesar datos (Parsear Usuario)
      this.gastos = (data || []).map(g => {
        const regexUsuario = /(.*)\s\(Por:\s(.*)\)$/;
        const match = g.descripcion ? g.descripcion.match(regexUsuario) : null;

        let descripcionLimpia = g.descripcion;
        let usuarioNombre = 'Desconocido/Sistema';

        if (match) {
          descripcionLimpia = match[1];
          usuarioNombre = match[2];
        }

        return {
          ...g,
          descripcionLimpia,
          usuarioNombre
        };
      });

      this.totalRegistros = count || 0;

    } catch (error: any) {
      this.mostrarToast('Error cargando lista: ' + error.message, 'error');
    } finally {
      this.cargandoTabla = false;
    }
  }

  // ================================================================
  //  ABM
  // ================================================================

  async agregarGasto() {
    if (!this.categoria || !this.descripcion || this.monto <= 0 || !this.fecha) {
      this.mostrarToast('Datos incompletos', 'error');
      return;
    }

    this.cargandoTabla = true;

    try {
      const client = this.supabase.getClient();
      const usuarioObj = await this.obtenerUsuarioActual();
      const usuarioNombre = usuarioObj.nombre;

      // 5️⃣ VALIDACIÓN DE CAJA (Si es Efectivo)
      let cajaAbiertaId: string | null = null;

      if (this.metodoPago === 'efectivo') {
        const { data: caja, error: errorCaja } = await client
          .from('cajas')
          .select('id')
          .eq('estado', 'abierta')
          .maybeSingle();

        if (errorCaja) throw errorCaja;

        if (!caja) {
          throw new Error('⛔ NO SE PUEDE REGISTRAR GASTO EN EFECTIVO: No hay una caja abierta actualmente.');
        }
        cajaAbiertaId = caja.id;
      }

      // Preparar fecha
      const fechaInput = new Date(this.fecha + 'T00:00:00');
      const esHoy = new Date().toDateString() === fechaInput.toDateString();
      let fechaParaGuardar = esHoy ? new Date() : new Date(this.fecha + 'T12:00:00');
      
      const offsetMs = fechaParaGuardar.getTimezoneOffset() * 60000;
      const fechaLocal = new Date(fechaParaGuardar.getTime() - offsetMs);

      const descripcionFinal = `${this.descripcion.trim()} (Por: ${usuarioNombre})`;

      // 6️⃣ GUARDAR GASTO
      const { error: errorGasto } = await client
        .from('gastos')
        .insert([{
          fecha: fechaLocal.toISOString(), 
          categoria: this.categoria,
          descripcion: descripcionFinal,
          monto: this.monto,
          metodo_pago: this.metodoPago
        }])
        .select()
        .single();

      if (errorGasto) throw errorGasto;

      // 7️⃣ REGISTRAR EN CAJA (Si corresponde)
      if (this.metodoPago === 'efectivo' && cajaAbiertaId) {
        const { error: errorMovimiento } = await client
          .from('movimientos_caja')
          .insert([{
            caja_id: cajaAbiertaId,
            tipo: 'egreso',
            concepto: `Gasto: ${this.categoria} - ${this.descripcion}`,
            monto: this.monto,
            metodo: 'efectivo',
            usuario_id: usuarioObj.id,
            usuario_nombre: usuarioNombre,
            observaciones: 'Registrado desde módulo Finanzas'
          }]);

        if (errorMovimiento) {
          console.error('Error al impactar en caja', errorMovimiento);
          this.mostrarToast('Gasto guardado, pero error al impactar en Caja', 'error');
        }
      }

      this.mostrarToast('Gasto registrado correctamente', 'success');
      this.resetForm();
      this.actualizarTodo();

    } catch (error: any) {
      this.mostrarToast(error.message, 'error');
    } finally {
      this.cargandoTabla = false;
    }
  }

  async guardarEdicion() {
    if (!this.editandoId) return;

    try {
        const usuarioObj = await this.obtenerUsuarioActual();
        const descripcionFinal = `${this.descripcion.trim()} (Editado por: ${usuarioObj.nombre})`;

        const { error } = await this.supabase.getClient()
        .from('gastos')
        .update({ 
            fecha: this.fecha,
            categoria: this.categoria, 
            descripcion: descripcionFinal,
            monto: this.monto
            // Nota: No actualizamos metodo_pago al editar para evitar inconsistencias con caja histórica
        })
        .eq('id', this.editandoId);

        if (error) throw error;

        this.mostrarToast('Gasto editado', 'success');
        this.editandoId = null;
        this.resetForm();
        this.actualizarTodo();
    } catch(err: any) {
        this.mostrarToast('Error al editar', 'error');
    }
  }

  async confirmarEliminar() {
    if (!this.gastoAEliminar) return;

    const { error } = await this.supabase.getClient()
      .from('gastos')
      .delete()
      .eq('id', this.gastoAEliminar);

    if (!error) {
      this.mostrarToast('Gasto eliminado', 'success');
      this.actualizarTodo();
    } else {
      this.mostrarToast('Error al eliminar', 'error');
    }
    this.cancelarEliminar();
  }

  // --- UTILS ---
  mostrarModalEliminar(id: string) { this.gastoAEliminar = id; this.mostrarModal = true; }
  cancelarEliminar() { this.mostrarModal = false; this.gastoAEliminar = null; }

  editarGasto(gasto: any) {
    this.editandoId = gasto.id;
    this.fecha = gasto.fecha.substring(0, 10);
    this.categoria = gasto.categoria;
    this.descripcion = gasto.descripcionLimpia || gasto.descripcion; 
    this.monto = gasto.monto;
    this.metodoPago = gasto.metodo_pago || 'efectivo';
    this.scrollToForm();
  }

  cancelarEdicion() { this.editandoId = null; this.resetForm(); }

  resetForm() {
    this.categoria = '';
    this.descripcion = '';
    this.monto = 0;
    this.fecha = new Date().toISOString().substring(0, 10);
    this.metodoPago = 'efectivo';
  }

  scrollToForm() {
    const form = document.getElementById('formularioGasto');
    if (form) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  mostrarToast(mensaje: string, tipo: 'success' | 'error' = 'success') {
    this.toastMensaje = mensaje;
    this.toastTipo = tipo;
    this.toastcolor = tipo === 'success' ? 'bg-green-600' : 'bg-red-600';
    this.toastVisible = true;
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => { this.toastVisible = false; }, 2500);
  }

  get totalPaginas(): number { return Math.ceil(this.totalRegistros / this.itemsPorPagina); }
  cambiarPagina(pag: number) { if (pag >= 1 && pag <= this.totalPaginas) { this.paginaActual = pag; this.cargarListaGastos(); } }
}