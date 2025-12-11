import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { RouterModule } from '@angular/router';
import { MonedaArsPipe } from '../../pipes/moneda-ars.pipe';
import { ThemeService } from '../../services/theme.service';

interface ProductoOriginal {
  producto_id: string;
  nombre: string;
  marca: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  talle: string;
  seleccionado: boolean;
  cantidadDevolver: number;
}

interface ProductoDisponible {
  id: string;
  nombre: string;
  marca: string;
  categoria: string;
  precio: number;
  talle: string;
  cantidad_stock: number;
  codigo: string;
}

interface ProductoRecambio {
  producto: ProductoDisponible;
  cantidad: number;
}

interface ItemHistorial {
  tipo: 'venta' | 'recambio'| 'ventaEliminada';
  id: string;
  fecha: Date;
  // Campos específicos de venta
  nombre_usuario?: string;
  cliente_nombre?: string;
  cliente_email?: string;
  fecha_venta?: Date;
  productos?: any[];
  metodo_pago?: string;
  descuento_aplicado?: number;
  total_final?: number;
  recambio_realizado?: boolean;
  // Campos específicos de recambio
  realizado_por?: string;
  fecha_recambio?: Date;
  venta_id?: string;
  motivo?: string;
  observaciones?: string;
  productos_devueltos?: any[];
  productos_recambio?: any[];
  total_original?: number;
  total_devuelto?: number;
  total_recambio?: number;
  diferencia_abonada?: number;
  metodo_pago_diferencia?: string;
  descuento_recambio?: number;
  monto_descuento_recambio?: number;
  eliminado_por?: string;
  fecha_eliminacion?: Date;
  motivo_eliminacion?: string;
}

interface ConfigRecibo {
  id?: string;
  nombre_negocio: string;
  direccion: string;
  ciudad: string;
  telefono1: string;
  telefono2: string;
  whatsapp1: string;
  whatsapp2: string;
  email_empresa: string | null;
  logo_url: string | null;
  mensaje_agradecimiento: string;
  mensaje_pie: string;
  email_desarrollador: string;
}

@Component({
  selector: 'app-historial',
  imports: [FormsModule, CommonModule, RouterModule, MonedaArsPipe ],
  standalone: true,
  templateUrl: './historial.component.html',
  styleUrl: './historial.component.css'
})
export class HistorialComponent implements OnInit {
  // Datos unificados
items: any[] = []; // Ahora solo contiene los 10 items de la página actual
  totalItems: number = 0; // Para calcular el total de páginas
  cargando: boolean = false; // Para mostrar un spinner si quieres
  itemsFiltrados: ItemHistorial[] = [];
  
  // Filtros
filtro: 'hoy' | '7dias' | '30dias' | 'todos' | 'fechaEspecifica' | 'rangoFechas' = 'hoy';
  tipoFiltro: 'todos' | 'ventas' | 'recambios'| 'ventasEliminadas' = 'todos';
metodoPagoFiltro: 'todos' | 'efectivo' | 'transferencia' | 'debito' | 'credito' | 'mercado_pago' | 'fiado' = 'todos';
  fechaEspecifica: string = '';
  fechaDesde: string = '';
  fechaHasta: string = '';
  
  // Totales (sin totalGeneral)
  totalVentas: number = 0;
  totalRecambios: number = 0;
  
  // Paginación
  paginaActual = 1;
  itemsPorPagina = 10;

  // Variables para el modal de recambio mejoradas
  mostrarModalRecambio = false;
  ventaSeleccionada: any = null;
  productosOriginales: ProductoOriginal[] = [];
  productosDisponibles: ProductoDisponible[] = [];
  productosRecambio: ProductoRecambio[] = [];
  busquedaProducto = '';
  
  // Totales y cálculos del modal
  totalDevuelto = 0;
  totalRecambio = 0;
  totalRecambioSinDescuento = 0;
  diferencia = 0;
  
  // Descuento del recambio
  codigoDescuentoRecambio = '';
  descuentoRecambioAplicado = 0;
  montoDescuentoRecambio = 0;
  
  // Formulario del modal
  metodoPagoSeleccionado = '';
  motivoRecambio = '';
  observacionesRecambio = '';
  procesandoRecambio = false;
  
  // Usuario actual para recambios
  usuarioActual: any = null;
  
metodosPago = ['efectivo', 'transferencia', 'debito', 'credito', 'mercado_pago', 'fiado'];

  // PROPIEDADES NUEVAS PARA EL TOAST
  toastVisible = false;
  toastMensaje = '';
  toastColor = 'bg-green-600'; 

  //PROPIEDADES PARA ELIMINACION
  mostrandoConfirmacionEliminar = false;
  ventaAEliminar: any = null;
  eliminandoVenta = false;
  motivoEliminacion = '';
  
// Filtro por búsqueda por cliente
busquedaCliente = '';

// Variables para el modal de recibo
mostrarModalRecibo = false;
ventaParaRecibo: any = null;
generandoRecibo = false;

// Variables para envío de email
mostrarModalEmail = false;
ventaParaEmail: any = null;
emailDestino = '';
enviandoEmail = false;

configRecibo: ConfigRecibo | null = null

cardsExpandidos: Set<string> = new Set();

cargandoTotales = false;
  constructor(private supabase: SupabaseService, public themeService: ThemeService) {}

  async ngOnInit() {
    await this.obtenerUsuarioActual();
    await this.cargarConfigRecibo();
    await this.cargarDatos();
    await this.cargarProductosDisponibles();
  }

  // MÉTODO PARA MOSTRAR EL TOAST
  mostrarToast(mensaje: string, color: string) {
    this.toastMensaje = mensaje;
    this.toastColor = color;
    this.toastVisible = true;
    setTimeout(() => {
      this.toastVisible = false;
    }, 2500);
  }

toggleCard(itemId: string): void {
  if (this.cardsExpandidos.has(itemId)) {
    this.cardsExpandidos.delete(itemId);
  } else {
    this.cardsExpandidos.add(itemId);
  }
}

isCardExpandido(itemId: string): boolean {
  return this.cardsExpandidos.has(itemId);
}

  async obtenerUsuarioActual() {
    const { data: sessionData, error } = await this.supabase.getClient().auth.getSession();
    if (sessionData.session?.user) {
      this.usuarioActual = sessionData.session.user;
    }
  }

  /*get itemsPaginados() {
    const inicio = (this.paginaActual - 1) * this.itemsPorPagina;
    return this.itemsFiltrados.slice(inicio, inicio + this.itemsPorPagina);
  }*/

 get totalPaginas(): number {
    return Math.ceil(this.totalItems / this.itemsPorPagina);
  }

 async cambiarPagina(pagina: number) {
    if (pagina >= 1 && pagina <= this.totalPaginas) {
      this.paginaActual = pagina;
      await this.cargarDatos(); 
    }
  }

async filtrar(f: 'hoy' | '7dias' | '30dias' | 'todos' | 'fechaEspecifica' | 'rangoFechas') {
    this.filtro = f;
    
    // Si elegimos un filtro automático, cargamos datos de inmediato
    if (f !== 'fechaEspecifica' && f !== 'rangoFechas') {
      this.paginaActual = 1;
      // Opcional: Limpiar las fechas manuales para que no queden "sucias"
      this.fechaEspecifica = '';
      this.fechaDesde = '';
      this.fechaHasta = '';
      await this.cargarDatos();
    } else {
      // Si elegimos un filtro manual (Fecha o Rango), LIMPIAMOS LA TABLA
      // Esto elimina la confusión de ver datos viejos
      this.items = [];
      this.totalItems = 0;
      this.totalVentas = 0;
      this.totalRecambios = 0;
      
    }
  }

  async filtrarTipo(tipo: 'todos' | 'ventas' | 'recambios'| 'ventasEliminadas') {
    this.tipoFiltro = tipo;
    this.paginaActual = 1;
    await this.cargarDatos();
  }

  filtrarPorBusqueda() {
    this.paginaActual = 1;
    this.cargarDatos(); // Dispara la búsqueda en DB
  }

  // NUEVO MÉTODO PARA FILTRAR POR MÉTODO DE PAGO
  async filtrarMetodoPago(metodoPago: any) {
    this.metodoPagoFiltro = metodoPago; // 1. Guardamos la selección
    this.paginaActual = 1;              // 2. Volvemos a la primera página
    await this.cargarDatos();           // 3. ¡IMPORTANTE! Recargamos desde la base de datos
  }

  trackByFn(index: number, item: ItemHistorial): string {
    return item.id;
  }

async cargarDatos() {
  this.cargando = true;        // Bloquea solo la tabla
  this.cargandoTotales = true; // Pone en carga las tarjetas de totales

  const from = (this.paginaActual - 1) * this.itemsPorPagina;
  const to = from + this.itemsPorPagina - 1;

  try {
    // --- FASE 1: CARGAR TABLA (Rápido, solo 10 items) ---
    let queryDatos = this.supabase.getClient()
      .from('vista_historial_unificado')
      .select('*', { count: 'exact' });
    
    // Aplicamos filtros
    queryDatos = this.aplicarFiltrosBase(queryDatos);
    
    // Pedimos solo los datos de la página actual
    const resDatos = await queryDatos.order('fecha', { ascending: false }).range(from, to);

    if (resDatos.error) throw resDatos.error;

    // Procesamos datos de la tabla
    this.totalItems = resDatos.count || 0;
    this.items = (resDatos.data || []).map((item: any) => ({
      ...item,
      fecha: new Date(item.fecha),
      fecha_venta: item.fecha ? new Date(item.fecha) : null,
      fecha_recambio: item.fecha ? new Date(item.fecha) : null
    }));

    // ⚡ DESBLOQUEAMOS LA UI INMEDIATAMENTE
    this.cargando = false; 

    // --- FASE 2: CALCULAR TOTALES (Lento, en segundo plano) ---
    // Llamamos a esto sin 'await' para que la interfaz no se congele
    this.calcularTotalesEnSegundoPlano();

  } catch (error: any) {
    console.error('Error cargando historial:', error.message);
    this.mostrarToast('Error al cargar los datos', 'bg-red-600');
    this.cargando = false;
    this.cargandoTotales = false;
  }
}

async calcularTotalesEnSegundoPlano() {
  try {
    // Optimizamos pidiendo SOLO las columnas necesarias (tipo y total)
    let queryTotales = this.supabase.getClient()
      .from('vista_historial_unificado')
      .select('tipo, total_final');
    
    // Aplicamos los mismos filtros que a la tabla
    queryTotales = this.aplicarFiltrosBase(queryTotales);

    const resTotales = await queryTotales;

    if (!resTotales.error) {
      const todosLosRegistros = resTotales.data || [];
      
      this.totalVentas = todosLosRegistros
        .filter((i: any) => i.tipo === 'venta')
        .reduce((acc: number, i: any) => acc + (i.total_final || 0), 0);

      this.totalRecambios = todosLosRegistros
        .filter((i: any) => i.tipo === 'recambio')
        .reduce((acc: number, i: any) => acc + (i.total_final || 0), 0);
    }
  } catch (err) {
    console.error('Error calculando totales en background:', err);
  } finally {
    // Al terminar (haya error o no), quitamos el spinner de los totales
    this.cargandoTotales = false;
  }
}

calcularTotalesPagina() {
    this.totalVentas = this.items
      .filter(i => i.tipo === 'venta')
      .reduce((acc, i) => acc + (i.total || 0), 0);

    this.totalRecambios = this.items
      .filter(i => i.tipo === 'recambio')
      .reduce((acc, i) => acc + (i.total || 0), 0);
  }

  async cargarVentas() {
    const { data: ventas, error }: { data: any[] | null, error: any } = await this.supabase
      .getClient()
      .rpc('obtener_historial_completo');

    if (error) {
      console.error('Error al obtener historial de ventas:', error.message);
      return;
    }

    const ventasFormateadas: ItemHistorial[] = (ventas || []).map(v => ({
      tipo: 'venta' as const,
      id: v.id,
      fecha: new Date(new Date(v.fecha_venta).getTime() - 3 * 60 * 60 * 1000),
      nombre_usuario: v.nombre_usuario,
      cliente_nombre: v.cliente_nombre,
      cliente_email: v.cliente_email,
      fecha_venta: new Date(new Date(v.fecha_venta).getTime() - 3 * 60 * 60 * 1000),
      productos: v.productos,
      metodo_pago: v.metodo_pago,
      descuento_aplicado: v.descuento_aplicado,
      total_final: v.total_final,
      recambio_realizado: v.recambio_realizado
    }));

    this.items = [...this.items.filter(i => i.tipo !== 'venta'), ...ventasFormateadas];
  }

  async cargarRecambios() {
    const { data: recambios, error } = await this.supabase
      .getClient()
      .from('recambios')
      .select(`
        *,
        ventas!inner(cliente_nombre, cliente_email)
      `)
      .order('fecha_recambio', { ascending: false });

    if (error) {
      console.error('Error al obtener recambios:', error.message);
      return;
    }

    const recambiosFormateados: ItemHistorial[] = (recambios || []).map(r => ({
      tipo: 'recambio' as const,
      id: r.id,
      fecha: new Date(new Date(r.fecha_recambio).getTime() - 3 * 60 * 60 * 1000),
      realizado_por: r.realizado_por,
      cliente_nombre: r.ventas.cliente_nombre,
      fecha_recambio: new Date(new Date(r.fecha_recambio).getTime() - 3 * 60 * 60 * 1000),
      venta_id: r.venta_id,
      motivo: r.motivo,
      observaciones: r.observaciones,
      productos_devueltos: r.productos_devueltos_json,
      productos_recambio: r.productos_recambio_json,
      total_original: r.total_original,
      total_devuelto: r.total_devuelto,
      total_recambio: r.total_recambio,
      diferencia_abonada: r.diferencia_abonada,
      metodo_pago_diferencia: r.metodo_pago_diferencia,
      descuento_recambio: r.descuento_recambio || 0,
      monto_descuento_recambio: r.monto_descuento_recambio || 0
    }));

    this.items = [...this.items.filter(i => i.tipo !== 'recambio'), ...recambiosFormateados];
  }

  async cargarVentasEliminadas() {
    const { data: ventasEliminadas, error } = await this.supabase
      .getClient()
      .from('ventas_eliminadas')
      .select(`
        *,
        productos_eliminados:productos_eliminados_json
      `)
      .order('fecha_eliminacion', { ascending: false });

    if (error) {
      console.error('Error al obtener ventas eliminadas:', error.message);
      return;
    }

    const ventasEliminadasFormateadas: ItemHistorial[] = (ventasEliminadas || []).map(v => ({
      tipo: 'ventaEliminada' as const,
      id: v.id,
      fecha: new Date(v.fecha_eliminacion),
      nombre_usuario: v.nombre_usuario,
      cliente_nombre: v.cliente_nombre,
      cliente_email: v.cliente_email,
      fecha_venta: new Date(v.fecha_venta_original),
      productos: v.productos_eliminados,
      metodo_pago: v.metodo_pago,
      descuento_aplicado: v.descuento_aplicado,
      total_final: v.total_final,
      eliminado_por: v.eliminado_por,
      fecha_eliminacion: new Date(v.fecha_eliminacion),
      motivo_eliminacion: v.motivo_eliminacion || 'Sin motivo especificado'
    }));

    this.items = [...this.items.filter(i => i.tipo !== 'ventaEliminada'), ...ventasEliminadasFormateadas];
  }

  combinarYOrdenarItems() {
    this.items.sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
  }

  aplicarFiltros() {
  let itemsFiltrados = [...this.items];

  // Filtrar por fecha
  switch (this.filtro) {
    case 'hoy':
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      itemsFiltrados = itemsFiltrados.filter(item => item.fecha >= hoy);
      break;
    case '7dias':
      const hace7dias = new Date();
      hace7dias.setDate(hace7dias.getDate() - 7);
      itemsFiltrados = itemsFiltrados.filter(item => item.fecha >= hace7dias);
      break;
    case '30dias':
      const hace30dias = new Date();
      hace30dias.setDate(hace30dias.getDate() - 30);
      itemsFiltrados = itemsFiltrados.filter(item => item.fecha >= hace30dias);
      break;
    case 'fechaEspecifica':
      if (this.fechaEspecifica) {
        const partesFecha = this.fechaEspecifica.split('-');
        const anio = parseInt(partesFecha[0], 10);
        const mes = parseInt(partesFecha[1], 10) - 1;
        const dia = parseInt(partesFecha[2], 10);

        const inicioDia = new Date(anio, mes, dia);
        const finDia = new Date(anio, mes, dia);
        finDia.setHours(23, 59, 59, 999);
        
        itemsFiltrados = itemsFiltrados.filter(item => 
          item.fecha >= inicioDia && item.fecha <= finDia
        );
      }
      break;
    case 'todos':
    default:
      break;
  }

  // Filtrar por tipo
  switch (this.tipoFiltro) {
    case 'ventas':
      itemsFiltrados = itemsFiltrados.filter(item => item.tipo === 'venta');
      break;
    case 'recambios':
      itemsFiltrados = itemsFiltrados.filter(item => item.tipo === 'recambio');
      break;
    case 'ventasEliminadas':
      itemsFiltrados = itemsFiltrados.filter(item => item.tipo === 'ventaEliminada');
      break;
    case 'todos':
    default:
      break;
  }

  // FILTRO POR MÉTODO DE PAGO (incluye 'fiado' y pagos mixtos)
  if (this.metodoPagoFiltro !== 'todos') {
    itemsFiltrados = itemsFiltrados.filter(item => {
      if (item.tipo === 'venta' || item.tipo === 'ventaEliminada') {
        let metodoPago = item.metodo_pago === 'modo' ? 'mercado_pago' : item.metodo_pago;
        
        if (this.esPagoMixto(metodoPago || '')) {
          const metodosInfo = this.getMetodosPagoMixto(metodoPago || '');
          if (metodosInfo) {
            const metodo1Normalizado = metodosInfo.metodo1 === 'modo' ? 'mercado_pago' : metodosInfo.metodo1;
            const metodo2Normalizado = metodosInfo.metodo2 === 'modo' ? 'mercado_pago' : metodosInfo.metodo2;
            
            return metodo1Normalizado === this.metodoPagoFiltro || metodo2Normalizado === this.metodoPagoFiltro;
          }
        }
        
        return metodoPago === this.metodoPagoFiltro;
      } else if (item.tipo === 'recambio') {
        return item.metodo_pago_diferencia === this.metodoPagoFiltro;
      }
      return false;
    });
  }

  // Filtro por búsqueda de cliente, email, ID de venta Y USUARIOS
  if (this.busquedaCliente.trim()) {
    const termino = this.busquedaCliente.toLowerCase().trim();
    itemsFiltrados = itemsFiltrados.filter(item => {
      const nombreCliente = item.cliente_nombre?.toLowerCase() || '';
      const emailCliente = item.cliente_email?.toLowerCase() || '';
      const idVenta = item.id?.toLowerCase() || '';
      
      // ✨ NUEVO: Agregar búsqueda por usuarios
      const nombreUsuario = item.nombre_usuario?.toLowerCase() || '';
      const realizadoPor = item.realizado_por?.toLowerCase() || ''; // Para recambios
      const eliminadoPor = item.eliminado_por?.toLowerCase() || ''; // Para ventas eliminadas
      
      return nombreCliente.includes(termino) || 
             emailCliente.includes(termino) || 
             idVenta.includes(termino) ||
             nombreUsuario.includes(termino) ||
             realizadoPor.includes(termino) ||
             eliminadoPor.includes(termino);
    });
  }

  this.itemsFiltrados = itemsFiltrados;
}

  // Métodos para recambios mejorados
  puedeRealizarRecambio(venta: any): boolean {
    const fechaVenta = new Date(venta.fecha_venta);
    const ahora = new Date();
    const diferenciaDias = Math.floor((ahora.getTime() - fechaVenta.getTime()) / (1000 * 60 * 60 * 24));
    
    return diferenciaDias <= 10 && !venta.recambio_realizado;
  }

  iniciarRecambio(venta: any) {
  if (!this.puedeRealizarRecambio(venta)) return;
  
  this.ventaSeleccionada = venta;
  
  // IMPORTANTE: La marca ya viene en venta.productos desde la RPC
  this.productosOriginales = venta.productos.map((p: any) => {
    const precioConDescuento = venta.descuento_aplicado > 0 
      ? p.precio_unitario * (1 - venta.descuento_aplicado / 100)
      : p.precio_unitario;
    
    return {
      producto_id: p.producto_id,
      nombre: p.nombre,
      marca: p.marca || 'Sin marca',  // ← LA MARCA YA VIENE DEL BACKEND
      cantidad: p.cantidad,
      precio_unitario: precioConDescuento,
      subtotal: precioConDescuento * p.cantidad,
      talle: p.talle,
      seleccionado: false,
      cantidadDevolver: 1
    };
  });
  
  this.productosRecambio = [];
  this.motivoRecambio = '';
  this.observacionesRecambio = '';
  this.metodoPagoSeleccionado = '';
  this.busquedaProducto = '';
  
  this.codigoDescuentoRecambio = '';
  this.descuentoRecambioAplicado = 0;
  this.montoDescuentoRecambio = 0;
  
  this.calcularTotalesRecambio();
  this.mostrarModalRecambio = true;
}

  cerrarModalRecambio() {
    this.mostrarModalRecambio = false;
    this.ventaSeleccionada = null;
    this.productosOriginales = [];
    this.productosRecambio = [];
  }

  async cargarProductosDisponibles() {
    const { data: productos, error } = await this.supabase
      .getClient()
      .from('productos')
      .select('*')
      .gt('cantidad_stock', 0)
      .order('nombre');

    if (!error && productos) {
      this.productosDisponibles = productos;
    }
  }

  buscarProductos() {
    // La búsqueda se hace en tiempo real filtrado desde productosDisponibles
  }

  get productosFiltrados(): ProductoDisponible[] {
    if (!this.busquedaProducto?.trim()) {
      return this.productosDisponibles?.slice(0, 10) || [];
    }
    
    const termino = this.busquedaProducto.toLowerCase();
    return (this.productosDisponibles || [])
      .filter(p => 
        p.nombre?.toLowerCase().includes(termino) ||
        p.codigo?.toLowerCase().includes(termino) ||
        p.marca?.toLowerCase().includes(termino)
      )
      .slice(0, 10);
  }

  agregarProductoRecambio(producto: ProductoDisponible) {
    const existe = this.productosRecambio.find(p => 
      p.producto.id === producto.id && p.producto.talle === producto.talle
    );
    
    if (existe) {
      if (existe.cantidad < producto.cantidad_stock) {
        existe.cantidad++;
      }
    } else {
      this.productosRecambio.push({
        producto: producto,
        cantidad: 1
      });
    }
    
    this.calcularTotalesRecambio();
  }

  quitarProductoRecambio(index: number) {
    this.productosRecambio.splice(index, 1);
    this.calcularTotalesRecambio();
  }

  getOpcionesCantidad(cantidadMaxima: number | undefined): number[] {
    const cantidad = cantidadMaxima || 1;
    return Array.from({ length: cantidad }, (_, i) => i + 1);
  }

  async aplicarDescuentoRecambio() {
  if (!this.codigoDescuentoRecambio?.trim()) {
    this.mostrarToast('Por favor, introduce un código de descuento.', 'bg-orange-600');
    return;
  }

  const { data, error } = await this.supabase
    .getClient()
    .from('descuentos')
    .select('*')
    .eq('codigo', this.codigoDescuentoRecambio)
    .eq('activo', true)
    .single();

  if (data) {
    // ✨ VALIDAR QUE SEA SOLO TIPO PORCENTAJE
    if (data.tipo === 'cantidad') {
      this.mostrarToast('❌ Los descuentos por cantidad (2x1, 3x2, etc.) no están disponibles para recambios. Solo se permiten descuentos por porcentaje.', 'bg-red-600');
      this.codigoDescuentoRecambio = '';
      return;
    }

    // ✨ VALIDAR QUE TENGA PORCENTAJE
    if (!data.porcentaje || data.porcentaje <= 0) {
      this.mostrarToast('❌ El descuento no tiene un porcentaje válido.', 'bg-red-600');
      this.codigoDescuentoRecambio = '';
      return;
    }

    this.descuentoRecambioAplicado = data.porcentaje;
    this.calcularTotalesRecambio();
    this.mostrarToast('✅ Descuento aplicado correctamente.', 'bg-green-600');
  } else {
    this.descuentoRecambioAplicado = 0;
    this.codigoDescuentoRecambio = '';
    this.calcularTotalesRecambio();
    this.mostrarToast('❌ Código de descuento inválido o inactivo.', 'bg-red-600');
  }
}

  quitarDescuentoRecambio() {
    this.descuentoRecambioAplicado = 0;
    this.codigoDescuentoRecambio = '';
    this.calcularTotalesRecambio();
    this.mostrarToast('Descuento eliminado.', 'bg-red-600');
  }

  calcularTotalesRecambio() {
    this.totalDevuelto = this.productosOriginales
      .filter(p => p.seleccionado)
      .reduce((total, p) => total + (p.precio_unitario * p.cantidadDevolver), 0);
    
    this.totalRecambioSinDescuento = this.productosRecambio
      .reduce((total, item) => total + (item.producto.precio * item.cantidad), 0);
    
    this.montoDescuentoRecambio = this.totalRecambioSinDescuento * (this.descuentoRecambioAplicado / 100);
    this.totalRecambio = this.totalRecambioSinDescuento - this.montoDescuentoRecambio;
    
    this.diferencia = this.totalRecambio - this.totalDevuelto;
  }

  puedeConfirmarRecambio(): boolean {
    const tieneProductosDevueltos = this.productosOriginales.some(p => p.seleccionado);
    const tieneProductosRecambio = this.productosRecambio.length > 0;
    const tieneMotivo = this.motivoRecambio.trim().length > 0;
    const tienePagoSiEsNecesario = this.diferencia <= 0 || this.metodoPagoSeleccionado.length > 0;
    
    return tieneProductosDevueltos && tieneProductosRecambio && tieneMotivo && tienePagoSiEsNecesario && !this.procesandoRecambio;
  }


// MÉTODO COMPLETO CORREGIDO para historial.component.ts
// Reemplazar completamente el método procesarRecambio()

async procesarRecambio() {
  if (!this.puedeConfirmarRecambio()) {
    if (!this.productosOriginales.some(p => p.seleccionado)) {
      this.mostrarToast('Debes seleccionar al menos un producto para devolver.', 'bg-red-600');
    } else if (this.productosRecambio.length === 0) {
      this.mostrarToast('Debes seleccionar al menos un producto para el recambio.', 'bg-red-600');
    } else if (!this.motivoRecambio.trim()) {
      this.mostrarToast('Debes especificar un motivo para el recambio.', 'bg-red-600');
    } else if (this.diferencia > 0 && !this.metodoPagoSeleccionado) {
      this.mostrarToast('Debes seleccionar un método de pago para la diferencia.', 'bg-red-600');
    }
    return;
  }
  
  if (this.diferencia < 0) {
    this.mostrarToast(
      'El recambio no puede generar un saldo a favor del cliente. El total de los productos de recambio debe ser igual o mayor al total de los productos devueltos.', 
      'bg-orange-600'
    );
    return; 
  }

  this.procesandoRecambio = true;
  
  try {
    const client = this.supabase.getClient();
    
    // Verificar si la venta original fue fiada
    const ventaOriginalFiada = this.ventaSeleccionada.metodo_pago === 'fiado';
    const diferenciaFiada = this.diferencia > 0 && this.metodoPagoSeleccionado === 'fiado';
    
    // Obtener el cliente_id desde la venta
    const { data: ventaData, error: errorVenta } = await client
      .from('ventas')
      .select('cliente_id')
      .eq('id', this.ventaSeleccionada.id)
      .single();
    
    if (errorVenta) {
      throw new Error(`Error al obtener información de la venta: ${errorVenta.message}`);
    }
    
    // Si la venta original fue fiada Y la diferencia también es fiada
    if (ventaOriginalFiada && diferenciaFiada && ventaData?.cliente_id) {
      
      // 1. Actualizar la venta_credito con la diferencia del recambio
      const { data: ventaCredito, error: errorVentaCredito } = await client
        .from('ventas_credito')
        .select('id, saldo_pendiente, monto_total')
        .eq('venta_id', this.ventaSeleccionada.id)
        .single();
      
      if (errorVentaCredito) {
        throw new Error(`Error al obtener venta crédito: ${errorVentaCredito.message}`);
      }
      
      if (ventaCredito) {
        // CÁLCULO: Solo sumamos la diferencia del recambio al saldo actual
        const nuevoSaldoPendiente = ventaCredito.saldo_pendiente + this.diferencia;
        const nuevoMontoTotal = ventaCredito.monto_total + this.diferencia;
        
        const { error: errorActualizarVC } = await client
          .from('ventas_credito')
          .update({
            monto_total: nuevoMontoTotal,
            saldo_pendiente: nuevoSaldoPendiente
          })
          .eq('id', ventaCredito.id);
        
        if (errorActualizarVC) {
          throw new Error(`Error al actualizar venta_credito: ${errorActualizarVC.message}`);
        }
      }
    }
    
    // Continuar con el proceso normal de recambio (actualizar stock)
    
    // Restaurar stock de productos devueltos
    for (const producto of this.productosOriginales.filter(p => p.seleccionado)) {
      const { error: errorStock } = await client.rpc('actualizar_stock', {
        producto_id: producto.producto_id,
        cantidad_cambio: producto.cantidadDevolver
      });
      
      if (errorStock) {
        throw new Error(`Error al actualizar stock de producto devuelto: ${errorStock.message}`);
      }
    }
    
    // Descontar stock de productos de recambio
    for (const item of this.productosRecambio) {
      const { error: errorStock } = await client.rpc('actualizar_stock', {
        producto_id: item.producto.id,
        cantidad_cambio: -item.cantidad
      });
      
      if (errorStock) {
        throw new Error(`Error al actualizar stock de producto de recambio: ${errorStock.message}`);
      }
    }
    
    // Preparar JSON de productos devueltos
    const productosDevueltosJson = this.productosOriginales
      .filter(p => p.seleccionado)
      .map(p => ({
        producto_id: p.producto_id,
        nombre: p.nombre,
        marca: p.marca || 'No hay marca',  
        cantidad: p.cantidadDevolver,
        precio_unitario: p.precio_unitario,
        subtotal: p.precio_unitario * p.cantidadDevolver,
        talle: p.talle
      }));
    
    // Preparar JSON de productos de recambio
    const productosRecambioJson = this.productosRecambio.map(item => ({
      producto_id: item.producto.id,
      nombre: item.producto.nombre,
      marca: item.producto.marca || 'No hay marca',
      cantidad: item.cantidad,
      precio_unitario: item.producto.precio,
      subtotal: item.producto.precio * item.cantidad,
      talle: item.producto.talle
    }));
    
    const usuarioNombre = this.usuarioActual?.user_metadata?.['nombre'] || 'Usuario desconocido';
    
    // Insertar registro de recambio
    const { data: recambio, error: errorRecambio } = await client
      .from('recambios')
      .insert({
        venta_id: this.ventaSeleccionada.id,
        total_original: this.ventaSeleccionada.total_final,
        total_recambio: this.totalRecambio,
        total_devuelto: this.totalDevuelto,
        diferencia_abonada: Math.max(0, this.diferencia),
        motivo: this.motivoRecambio,
        observaciones: this.observacionesRecambio,
        metodo_pago_diferencia: this.diferencia > 0 ? this.metodoPagoSeleccionado : null,
        productos_devueltos_json: productosDevueltosJson,
        productos_recambio_json: productosRecambioJson,
        realizado_por: usuarioNombre,
        descuento_recambio: this.descuentoRecambioAplicado,
        monto_descuento_recambio: this.montoDescuentoRecambio
      })
      .select()
      .single();
    
    if (errorRecambio) {
      throw new Error(`Error al crear recambio: ${errorRecambio.message}`);
    }
    
    // Insertar detalles del recambio
    for (const item of this.productosRecambio) {
      const { error: errorDetalle } = await client
        .from('detalle_recambio')
        .insert({
          recambio_id: recambio.id,
          producto_id: item.producto.id,
          cantidad: item.cantidad,
          precio_unitario: item.producto.precio,
          subtotal: item.producto.precio * item.cantidad,
          talle: item.producto.talle
        });
      
      if (errorDetalle) {
        throw new Error(`Error al crear detalle de recambio: ${errorDetalle.message}`);
      }
    }
    
    // Marcar la venta como recambiada
    const { error: errorVentaMarca } = await client
      .from('ventas')
      .update({ recambio_realizado: true })
      .eq('id', this.ventaSeleccionada.id);
    
    if (errorVentaMarca) {
      throw new Error(`Error al marcar venta como recambiada: ${errorVentaMarca.message}`);
    }
    
    // NUEVO: Registrar movimiento en caja si la diferencia se pagó en efectivo
    if (this.diferencia > 0 && this.metodoPagoSeleccionado === 'efectivo') {
      await this.registrarMovimientoEnCaja(
        this.diferencia,
        this.ventaSeleccionada.id,
        this.ventaSeleccionada.cliente_nombre
      );
    }
    
    // Recargar datos y cerrar modal
    await this.cargarDatos();
    this.cerrarModalRecambio();
    
    const mensajeExito = diferenciaFiada 
      ? '¡Recambio procesado exitosamente! El saldo del cliente ha sido actualizado.'
      : '¡Recambio procesado exitosamente!';
    
    this.mostrarToast(mensajeExito, 'bg-green-600');
    
  } catch (error: any) {
    console.error('Error al procesar recambio:', error);
    this.mostrarToast(`Error al procesar el recambio: ${error.message}`, 'bg-red-600');
  } finally {
    this.procesandoRecambio = false;
  }
}

// ========== MÉTODO PARA REGISTRAR EN CAJA ==========

/**
 * Registra el movimiento de efectivo del recambio en la caja actual
 */
async registrarMovimientoEnCaja(
  monto: number,
  ventaId: string,
  clienteNombre: string
): Promise<void> {
  try {
    // Obtener la caja abierta actual
    const { data: cajaAbierta, error: errorCaja } = await this.supabase
      .getClient()
      .from('cajas')
      .select('*')
      .eq('estado', 'abierta')
      .maybeSingle();

    if (errorCaja) {
      console.error('Error al buscar caja abierta:', errorCaja);
      return;
    }

    if (!cajaAbierta) {
      console.warn('No hay caja abierta, no se registrará el movimiento');
      return;
    }

    // Obtener usuario actual
    const usuarioNombre = this.usuarioActual?.user_metadata?.['nombre'] || 'Usuario desconocido';
    const usuarioId = this.usuarioActual?.id || 'unknown';

    // Registrar ingreso del efectivo del recambio
    const movimiento = {
      caja_id: cajaAbierta.id,
      tipo: 'ingreso',
      concepto: 'Recambio - Diferencia en efectivo',
      monto: monto,
      metodo: 'efectivo',
      venta_id: ventaId,
      usuario_id: usuarioId,
      usuario_nombre: usuarioNombre,
      observaciones: `Recambio de ${clienteNombre} - Diferencia pagada en efectivo`,
      created_at: new Date().toISOString()
    };

    const { error: errorMovimiento } = await this.supabase
      .getClient()
      .from('movimientos_caja')
      .insert(movimiento);

    if (errorMovimiento) {
      console.error('Error al registrar movimiento en caja:', errorMovimiento);
      return;
    }

    // Actualizar monto actual de la caja
    const nuevoMontoActual = cajaAbierta.monto_actual + monto;

    const { error: errorActualizacion } = await this.supabase
      .getClient()
      .from('cajas')
      .update({ 
        monto_actual: nuevoMontoActual,
        updated_at: new Date().toISOString()
      })
      .eq('id', cajaAbierta.id);

    if (errorActualizacion) {
      console.error('Error al actualizar monto de caja:', errorActualizacion);
    } else {
    }
  } catch (error) {
    console.error('Error al registrar movimiento en caja:', error);
  }
}

  // Método para iniciar la eliminación de una venta
  iniciarEliminacionVenta(venta: any) {
    if (venta.recambio_realizado) {
      this.mostrarToast('No se puede eliminar una venta que ya tiene un recambio realizado.', 'bg-red-600');
      return;
    }
    
    this.ventaAEliminar = venta;
    this.mostrandoConfirmacionEliminar = true;
  }

  // Método para cancelar la eliminación
  cancelarEliminacion() {
    this.mostrandoConfirmacionEliminar = false;
    this.ventaAEliminar = null;
    this.motivoEliminacion = '';
  }

// Método para confirmar y procesar la eliminación
async confirmarEliminacion() {
  if (!this.ventaAEliminar || this.eliminandoVenta) return;
  
  if (!this.motivoEliminacion.trim()) {
    this.mostrarToast('El motivo de eliminación es obligatorio.', 'bg-red-600');
    return;
  }

  this.eliminandoVenta = true;
  
  // Guardar el método de pago ANTES de eliminar para usarlo en el mensaje final
  const metodoPagoOriginal = this.ventaAEliminar.metodo_pago;
  
  try {
    const client = this.supabase.getClient();
    
    const usuarioNombre = this.usuarioActual?.user_metadata?.['nombre'] || 'Usuario desconocido';
    
    // 1. VERIFICAR SI ES UNA VENTA FIADA Y SI TIENE PAGOS ASOCIADOS
    let ventaCreditoId: string | null = null;
    let saldoPendiente = 0;
    let clienteId: string | null = null;
    
    if (metodoPagoOriginal === 'fiado') {
      // Buscar el registro de venta_credito asociado
      const { data: ventaCredito, error: errorVentaCredito } = await client
        .from('ventas_credito')
        .select('id, saldo_pendiente, cliente_id')
        .eq('venta_id', this.ventaAEliminar.id)
        .single();
      
      if (errorVentaCredito && errorVentaCredito.code !== 'PGRST116') {
        throw new Error(`Error al verificar venta fiada: ${errorVentaCredito.message}`);
      }
      
      if (ventaCredito) {
        ventaCreditoId = ventaCredito.id;
        saldoPendiente = ventaCredito.saldo_pendiente;
        clienteId = ventaCredito.cliente_id;
        
        // Verificar si tiene pagos asociados
        const { data: pagos, error: errorPagos } = await client
          .from('pagos_cliente')
          .select('id')
          .eq('venta_credito_id', ventaCreditoId);
        
        if (errorPagos) {
          throw new Error(`Error al verificar pagos: ${errorPagos.message}`);
        }
        
        // Si tiene pagos, BLOQUEAR eliminación y salir
        if (pagos && pagos.length > 0) {
          this.mostrarToast('❌ No se puede eliminar la venta porque tiene pagos asociados. Debe contactar con el soporte del sistema.', 'bg-red-600');
          this.eliminandoVenta = false;
          return; // SALIR SIN CONTINUAR
        }
      }
    }
    
    // 2. Guardar la venta en la tabla de ventas eliminadas ANTES de eliminarla
    const { error: errorVentaEliminada } = await client
      .from('ventas_eliminadas')
      .insert({
        venta_id_original: this.ventaAEliminar.id,
        cliente_nombre: this.ventaAEliminar.cliente_nombre,
        cliente_email: this.ventaAEliminar.cliente_email,
        fecha_venta_original: this.ventaAEliminar.fecha_venta,
        nombre_usuario: this.ventaAEliminar.nombre_usuario,
        metodo_pago: this.ventaAEliminar.metodo_pago,
        descuento_aplicado: this.ventaAEliminar.descuento_aplicado || 0,
        total_final: this.ventaAEliminar.total_final,
        productos_eliminados_json: this.ventaAEliminar.productos,
        eliminado_por: usuarioNombre,
        motivo_eliminacion: this.motivoEliminacion.trim()
      });
    
    if (errorVentaEliminada) {
      throw new Error(`Error al guardar venta eliminada: ${errorVentaEliminada.message}`);
    }
    
    // 3. SI ES VENTA FIADA, RESTAURAR EL SALDO DEL CLIENTE
    if (clienteId && saldoPendiente > 0) {
      const { error: errorActualizarCliente } = await client.rpc('actualizar_saldo_cliente', {
        p_cliente_id: clienteId,
        p_monto: -saldoPendiente
      });
      
      if (errorActualizarCliente) {
        throw new Error(`Error al actualizar saldo del cliente: ${errorActualizarCliente.message}`);
      }
    }
    
    // 4. SI ES VENTA FIADA, ELIMINAR EL REGISTRO DE VENTAS_CREDITO
    if (ventaCreditoId) {
      const { error: errorVentaCredito } = await client
        .from('ventas_credito')
        .delete()
        .eq('id', ventaCreditoId);
      
      if (errorVentaCredito) {
        throw new Error(`Error al eliminar venta crédito: ${errorVentaCredito.message}`);
      }
    }
    
    // 5. Restaurar el stock de los productos vendidos
    for (const producto of this.ventaAEliminar.productos) {
      const { error: errorStock } = await client.rpc('actualizar_stock', {
        producto_id: producto.producto_id,
        cantidad_cambio: producto.cantidad
      });
      
      if (errorStock) {
        throw new Error(`Error al restaurar stock del producto: ${errorStock.message}`);
      }
    }
    
    // 6. Eliminar registros de detalle_venta
    const { error: errorDetalle } = await client
      .from('detalle_venta')
      .delete()
      .eq('venta_id', this.ventaAEliminar.id);
    
    if (errorDetalle) {
      throw new Error(`Error al eliminar detalle de venta: ${errorDetalle.message}`);
    }
    
    // 7. Eliminar la venta principal
    const { error: errorVenta } = await client
      .from('ventas')
      .delete()
      .eq('id', this.ventaAEliminar.id);
    
    if (errorVenta) {
      throw new Error(`Error al eliminar venta: ${errorVenta.message}`);
    }
    
    // 8. Recargar datos y cerrar modal
    await this.cargarDatos();
    this.cancelarEliminacion();
    
    // Usar la variable guardada en lugar de this.ventaAEliminar que ahora es null
    const mensajeExito = metodoPagoOriginal === 'fiado' 
      ? '✅ Venta eliminada exitosamente. El stock y el saldo del cliente han sido restaurados.'
      : '✅ Venta eliminada exitosamente. El stock ha sido restaurado.';
    
    this.mostrarToast(mensajeExito, 'bg-green-600');
    
  } catch (error: any) {
    console.error('Error al eliminar venta:', error);
    this.mostrarToast(`❌ Error al eliminar la venta: ${error.message}`, 'bg-red-600');
  } finally {
    this.eliminandoVenta = false;
  }
}

abrirModalRecibo(venta: any) {
  this.ventaParaRecibo = venta;
  this.mostrarModalRecibo = true;
}

cerrarModalRecibo() {
  this.mostrarModalRecibo = false;
  this.ventaParaRecibo = null;
}

async generarReciboPDF(venta: any, descargar: boolean = true): Promise<Blob | undefined> {
  this.generandoRecibo = true;
  
  try {
    const jsPDF = (await import('jspdf')).default;
    
    // Calcular altura estimada basada en productos
    const alturaBase = 150;
    const alturaPorProducto = 15;
    const cantidadProductos = venta.productos.length;
    const alturaEstimada = alturaBase + (cantidadProductos * alturaPorProducto);

    const doc = new jsPDF({
      unit: 'mm',
      format: [80, Math.max(alturaEstimada, 170)]
    });
    
    const margen = 5;
    const anchoUtil = 70;
    let y = 8;
    
    // ===== ENCABEZADO CON LOGO =====
    // Usar logo de configRecibo si existe
    if (this.configRecibo?.logo_url) {
      try {
        const logoWidth = 35;
        const logoHeight = 18;
        const logoX = (80 - logoWidth) / 2;
        doc.addImage(this.configRecibo.logo_url, 'JPG', logoX, y, logoWidth, logoHeight);
        y += logoHeight + 5;
      } catch (error) {
        y += 2;
      }
    } else {
      y += 2;
    }

    // NOMBRE DEL NEGOCIO
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(this.configRecibo?.nombre_negocio || 'PRISYS SOLUTIONS', 40, y, { align: 'center' });
    y += 6;
    
    // Dirección
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(this.configRecibo?.direccion || '9 DE JULIO 1718', 40, y, { align: 'center' });
    y += 3.5;
    doc.text(this.configRecibo?.ciudad || 'Corrientes - Capital (3400)', 40, y, { align: 'center' });
    y += 3.5;
    
    // Teléfonos
    const tel1 = this.configRecibo?.telefono1 || '(3735) 475716';
    const tel2 = this.configRecibo?.telefono2 || '(3735) 410299';
    doc.text(`Cel: ${tel1} - ${tel2}`, 40, y, { align: 'center' });
    y += 3.5;
    
    // WhatsApp
    const wsp1 = this.configRecibo?.whatsapp1 || '3735 475716';
    const wsp2 = this.configRecibo?.whatsapp2 || '3735 410299';
    doc.text(`WhatsApp: ${wsp1} - ${wsp2}`, 40, y, { align: 'center' });
    y += 3.5;
    
    // Email del negocio (solo si existe)
    if (this.configRecibo?.email_empresa) {
      doc.text(this.configRecibo.email_empresa, 40, y, { align: 'center' });
      y += 3.5;
    }
    
    y += 2.5;
    
    // Línea divisoria doble
    doc.setLineWidth(0.3);
    doc.line(margen, y, margen + anchoUtil, y);
    y += 1;
    doc.line(margen, y, margen + anchoUtil, y);
    y += 5;
    
    // ===== INFORMACIÓN DE LA VENTA =====
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('COMPROBANTE DE VENTA', 40, y, { align: 'center' });
    y += 4;
    
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('NO VÁLIDO COMO FACTURA', 40, y, { align: 'center' });
    y += 6;
    
    // Número de comprobante
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Cod venta: ${venta.id.slice(-8)}`, margen, y); 
  y += 4;
    
    // Fecha con formato 24 horas
    const fechaVenta = new Date(venta.fecha_venta);
    const dia = String(fechaVenta.getDate()).padStart(2, '0');
    const mes = String(fechaVenta.getMonth() + 1).padStart(2, '0');
    const anio = fechaVenta.getFullYear();
    const hora = String(fechaVenta.getHours()).padStart(2, '0');
    const minutos = String(fechaVenta.getMinutes()).padStart(2, '0');
    const fechaFormateada = `${dia}/${mes}/${anio} ${hora}:${minutos}`;

    doc.text(`Fecha: ${fechaFormateada}`, margen, y);
    y += 6;
    
    // Cliente
    if (venta.cliente_nombre) {
      doc.text(`Cliente: ${venta.cliente_nombre.toUpperCase()}`, margen, y);
      y += 6;
    }
    
    // Vendedor
    doc.text(`Vendedor/Cajero: ${venta.nombre_usuario}`, margen, y);
    y += 6;
    
    // Línea divisoria
    doc.setLineWidth(0.2);
    doc.line(margen, y, margen + anchoUtil, y);
    y += 5;
    
    // ===== PRODUCTOS =====
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('CANT', margen, y);
    doc.text('DESCRIPCIÓN', margen + 10, y);
    doc.text('IMPORTE', margen + anchoUtil - 5, y, { align: 'right' });
    y += 1;
    doc.line(margen, y, margen + anchoUtil, y);
    y += 4;
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    
    for (const producto of venta.productos) {
      // Cantidad
      doc.text(`${producto.cantidad}`, margen + 2, y);
      
      // Descripción del producto
      const descripcion = `${producto.nombre}${producto.marca ? ' - ' + producto.marca : ''}`;
      const descripcionLineas = doc.splitTextToSize(descripcion, 40);
      doc.text(descripcionLineas, margen + 10, y);
      
      // Total del producto
      doc.text(`$${producto.subtotal.toFixed(2)}`, margen + anchoUtil - 5, y, { align: 'right' });
      
      y += descripcionLineas.length * 4;
      
      // Precio unitario y talle en línea aparte
      doc.setFontSize(7);
      doc.text(`  $${producto.precio_unitario.toFixed(2)} c/u`, margen + 10, y);
      if (producto.talle) {
        doc.text(`- Talle: ${producto.talle}`, margen + 30, y);
      }
      doc.setFontSize(8);
      y += 4;
    }
    
    y += 2;
    
    // Línea divisoria
    doc.line(margen, y, margen + anchoUtil, y);
    y += 5;
    
    // ===== TOTALES =====
    doc.setFontSize(9);
    
    const subtotal = venta.productos.reduce((sum: number, p: any) => sum + p.subtotal, 0);
    
    // Subtotal
    doc.text('SUBTOTAL $:', margen, y);
    doc.text(`${subtotal.toFixed(2)}`, margen + anchoUtil - 5, y, { align: 'right' });
    y += 5;
    
    // Descuento si aplica
    if (venta.descuento_aplicado > 0) {
      const montoDescuento = subtotal * venta.descuento_aplicado / 100;
      doc.text(`Desc. ${venta.descuento_aplicado}% $:`, margen, y);
      doc.text(`-${montoDescuento.toFixed(2)}`, margen + anchoUtil - 5, y, { align: 'right' });
      y += 5;
    }
    
    // Total final
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('TOTAL $:', margen, y);
    doc.text(`${venta.total_final.toFixed(2)}`, margen + anchoUtil - 5, y, { align: 'right' });
    y += 6;
    
    // Método de pago
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const metodoPagoNormalizado = this.normalizarMetodoPagoParaMostrar(venta.metodo_pago || '');
    
    const metodoPagoLineas = doc.splitTextToSize(`Forma de pago: ${metodoPagoNormalizado.toUpperCase()}`, anchoUtil);
    metodoPagoLineas.forEach((linea: string) => {
      doc.text(linea, margen, y);
      y += 4;
    });
    y += 4;
    
    // Línea divisoria doble
    doc.setLineWidth(0.3);
    doc.line(margen, y, margen + anchoUtil, y);
    y += 1;
    doc.line(margen, y, margen + anchoUtil, y);
    y += 6;
    
    // ===== PIE DE PÁGINA =====
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    const mensajeGracias = this.configRecibo?.mensaje_agradecimiento || '¡Gracias por su compra!';
    doc.text(mensajeGracias, 40, y, { align: 'center' });
    y += 6;

    // Desarrollado por (SIEMPRE FIJO)
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    const mensajePie = this.configRecibo?.mensaje_pie || 'DESARROLLADO POR PRISYS SOLUTIONS';
    doc.text(mensajePie, 40, y, { align: 'center' });
    y += 3.5;
    const emailDev = this.configRecibo?.email_desarrollador || 'prisys.solutions@gmail.com';
    doc.text(emailDev, 40, y, { align: 'center' });
    y += 5;
    
    if (descargar) {
    doc.save(`recibo-${venta.id.slice(-8)}.pdf`);
    this.mostrarToast('✅ Recibo descargado correctamente', 'bg-green-600');
    return undefined;
  } else {
    return doc.output('blob');
  }
    
  } catch (error: any) {
    console.error('Error al generar recibo:', error);
    this.mostrarToast('❌ Error al generar el recibo', 'bg-red-600');
    return undefined;
  } finally {
    this.generandoRecibo = false;
  }
}

imprimirRecibo(venta: any) {
  this.generarReciboPDF(venta, true);
}

abrirModalEmail(venta: any) {
  this.ventaParaEmail = venta;
  this.emailDestino = venta.cliente_email || '';
  this.mostrarModalEmail = true;
}

cerrarModalEmail() {
  this.mostrarModalEmail = false;
  this.ventaParaEmail = null;
  this.emailDestino = '';
}

async enviarDetalleEmail() {
  if (!this.emailDestino.trim()) {
    this.mostrarToast('❌ Debes ingresar un email válido', 'bg-red-600');
    return;
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(this.emailDestino)) {
    this.mostrarToast('❌ Formato de email inválido', 'bg-red-600');
    return;
  }
  
  this.enviandoEmail = true;
  
  try {
    const pdfBlob = await this.generarReciboPDF(this.ventaParaEmail, false);
    if (!pdfBlob) throw new Error('No se pudo generar PDF');
    
    const base64data = await this.blobToBase64(pdfBlob as Blob);
    const base64Content = base64data.split(',')[1];
    
    // CAMBIO AQUÍ: Recortamos el ID a los últimos 8 caracteres
    const detalleVenta = {
      id: this.ventaParaEmail.id.slice(-8), // <--- ESTO ES LA CLAVE
      fecha: new Date(this.ventaParaEmail.fecha_venta).toLocaleString('es-AR'),
      cliente: this.ventaParaEmail.cliente_nombre || 'Cliente',
      productos: this.ventaParaEmail.productos,
      total: this.ventaParaEmail.total_final,
      metodo_pago: this.ventaParaEmail.metodo_pago,
      descuento: this.ventaParaEmail.descuento_aplicado || 0
    };
    
    const { error } = await this.supabase.getClient().functions.invoke('enviar-detalle-venta', {
      body: {
        email: this.emailDestino,
        detalle: detalleVenta,
        pdfBase64: base64Content
      }
    });
    
    if (error) throw error;
    
    this.mostrarToast('✅ Email enviado correctamente', 'bg-green-600');
    this.cerrarModalEmail();
    
  } catch (error: any) {
    console.error('Error enviando email:', error);
    this.mostrarToast('❌ Error al enviar email', 'bg-red-600');
  } finally {
    this.enviandoEmail = false;
  }
}

// Método auxiliar para convertir Blob a Base64
private blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Agregar este método en la clase HistorialComponent
esPagoMixto(metodoPago: string): boolean {
  return metodoPago?.includes('+') || metodoPago?.includes('(');
}

// Agregar método para extraer métodos de pago mixto
getMetodosPagoMixto(metodoPago: string): { metodo1: string; monto1: number; metodo2: string; monto2: number } | null {
  if (!this.esPagoMixto(metodoPago)) return null;
  
  // Formato esperado: "efectivo ($500.00) + transferencia ($300.00)"
  const regex = /(\w+)\s*\(\$([0-9.]+)\)\s*\+\s*(\w+)\s*\(\$([0-9.]+)\)/;
  const match = metodoPago.match(regex);
  
  if (match) {
    return {
      metodo1: match[1],
      monto1: parseFloat(match[2]),
      metodo2: match[3],
      monto2: parseFloat(match[4])
    };
  }
  
  return null;
}

normalizarMetodoPago(metodo: string): string {
  return metodo === 'modo' ? 'mercado_pago' : metodo;
}

// Actualizar este método para que también reemplace los guiones bajos
normalizarMetodoPagoParaMostrar(metodoPago: string): string {
  return metodoPago
    .replace(/\bmodo\b/g, 'mercado_pago')  // Reemplazar 'modo' por 'mercado_pago'
    .replace(/_/g, ' ');  // Reemplazar guiones bajos por espacios
}

// Agregar las mismas propiedades
metodoPagoLabels: { [key: string]: string } = {
  'efectivo': 'Efectivo',
  'transferencia': 'Transferencia',
  'debito': 'Débito',
  'credito': 'Crédito',
  'mercado_pago': 'Mercado Pago',
  'fiado': 'Fiado'
};

getMetodoLabel(metodo: string): string {
  return this.metodoPagoLabels[metodo] || metodo;
}

async visualizarRecibo(venta: ItemHistorial) {
  this.generandoRecibo = true;
  
  try {
    const jsPDF = (await import('jspdf')).default;
    
    // Calcular altura estimada basada en productos
    const alturaBase = 150;
    const alturaPorProducto = 15;
    const cantidadProductos = venta.productos?.length || 0;
    const alturaEstimada = alturaBase + (cantidadProductos * alturaPorProducto);

    const doc = new jsPDF({
      unit: 'mm',
      format: [80, Math.max(alturaEstimada, 170)]
    });
    
    const margen = 5;
    const anchoUtil = 70;
    let y = 8;
    
   // ===== ENCABEZADO CON LOGO =====
if (this.configRecibo?.logo_url) {
  try {
    const logoWidth = 35;
    const logoHeight = 18;
    const logoX = (80 - logoWidth) / 2;
    doc.addImage(this.configRecibo.logo_url, 'JPG', logoX, y, logoWidth, logoHeight);
    y += logoHeight + 5;
  } catch (error) {
    y += 2;
  }
} else {
  y += 2;
}

 // NOMBRE DEL NEGOCIO
doc.setFontSize(14);
doc.setFont('helvetica', 'bold');
doc.text(this.configRecibo?.nombre_negocio || 'PRISYS SOLUTIONS', 40, y, { align: 'center' });
y += 6;

// Dirección
doc.setFontSize(8);
doc.setFont('helvetica', 'normal');
doc.text(this.configRecibo?.direccion || '9 DE JULIO 1718', 40, y, { align: 'center' });
y += 3.5;
doc.text(this.configRecibo?.ciudad || 'Corrientes - Capital (3400)', 40, y, { align: 'center' });
y += 3.5;

// Teléfonos
const tel1 = this.configRecibo?.telefono1 || '(3735) 475716';
const tel2 = this.configRecibo?.telefono2 || '(3735) 410299';
doc.text(`Cel: ${tel1} - ${tel2}`, 40, y, { align: 'center' });
y += 3.5;

// WhatsApp
const wsp1 = this.configRecibo?.whatsapp1 || '3735 475716';
const wsp2 = this.configRecibo?.whatsapp2 || '3735 410299';
doc.text(`WhatsApp: ${wsp1} - ${wsp2}`, 40, y, { align: 'center' });
y += 3.5;

// Email del negocio (solo si existe)
if (this.configRecibo?.email_empresa) {
  doc.text(this.configRecibo.email_empresa, 40, y, { align: 'center' });
  y += 3.5;
}

y += 2.5;
    
    // Línea divisoria doble
    doc.setLineWidth(0.3);
    doc.line(margen, y, margen + anchoUtil, y);
    y += 1;
    doc.line(margen, y, margen + anchoUtil, y);
    y += 5;
    
    // ===== INFORMACIÓN DE LA VENTA =====
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('COMPROBANTE DE VENTA', 40, y, { align: 'center' });
    y += 4;
    
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text('NO VÁLIDO COMO FACTURA', 40, y, { align: 'center' });
    y += 6;
    
    // Número de comprobante
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Cod venta: ${venta.id.slice(-8)}`, margen, y);
    y += 4;
    
    // Fecha con formato 24 horas
    if (venta.fecha_venta) {
      const fechaVenta = new Date(venta.fecha_venta);
      const dia = String(fechaVenta.getDate()).padStart(2, '0');
      const mes = String(fechaVenta.getMonth() + 1).padStart(2, '0');
      const anio = fechaVenta.getFullYear();
      const hora = String(fechaVenta.getHours()).padStart(2, '0');
      const minutos = String(fechaVenta.getMinutes()).padStart(2, '0');
      const fechaFormateada = `${dia}/${mes}/${anio} ${hora}:${minutos}`;
      
      doc.text(`Fecha: ${fechaFormateada}`, margen, y);
      y += 6;
    }
    
    // Cliente
if (venta.cliente_nombre) {
  doc.text(`Cliente: ${venta.cliente_nombre.toUpperCase()}`, margen, y);
  y += 6;
}
    
    // Vendedor
    if (venta.nombre_usuario) {
      doc.text(`Vendedor/Cajero: ${venta.nombre_usuario}`, margen, y);
      y += 6;
    }
    
    // Línea divisoria
    doc.setLineWidth(0.2);
    doc.line(margen, y, margen + anchoUtil, y);
    y += 5;
    
    // ===== PRODUCTOS =====
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('CANT', margen, y);
    doc.text('DESCRIPCIÓN', margen + 10, y);
    doc.text('IMPORTE', margen + anchoUtil - 5, y, { align: 'right' });
    y += 1;
    doc.line(margen, y, margen + anchoUtil, y);
    y += 4;
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    
    if (venta.productos && venta.productos.length > 0) {
      for (const producto of venta.productos) {
        // Cantidad
        doc.text(`${producto.cantidad}`, margen + 2, y);
        
        // Descripción del producto
        const descripcion = `${producto.nombre}${producto.marca ? ' - ' + producto.marca : ''}`;
        const descripcionLineas = doc.splitTextToSize(descripcion, 40);
        doc.text(descripcionLineas, margen + 10, y);
        
        // Total del producto
        doc.text(`$${producto.subtotal.toFixed(2)}`, margen + anchoUtil - 5, y, { align: 'right' });
        
        y += descripcionLineas.length * 4;
        
        // Precio unitario y talle en línea aparte
        doc.setFontSize(7);
        doc.text(`  $${producto.precio_unitario.toFixed(2)} c/u`, margen + 10, y);
        if (producto.talle) {
          doc.text(`- Talle: ${producto.talle}`, margen + 30, y);
        }
        doc.setFontSize(8);
        y += 4;
      }
    }
    
    y += 2;
    
    // Línea divisoria
    doc.line(margen, y, margen + anchoUtil, y);
    y += 5;
    
    // ===== TOTALES =====
    doc.setFontSize(9);
    
    const subtotal = venta.productos?.reduce((sum: number, p: { subtotal: number }) => sum + p.subtotal, 0) || 0;
    
    // Subtotal
    doc.text('SUBTOTAL $:', margen, y);
    doc.text(`${subtotal.toFixed(2)}`, margen + anchoUtil - 5, y, { align: 'right' });
    y += 5;
    
    // Descuento si aplica
    if (venta.descuento_aplicado && venta.descuento_aplicado > 0) {
      const montoDescuento = subtotal * venta.descuento_aplicado / 100;
      doc.text(`Desc. ${venta.descuento_aplicado}% $:`, margen, y);
      doc.text(`-${montoDescuento.toFixed(2)}`, margen + anchoUtil - 5, y, { align: 'right' });
      y += 5;
    }
    
    // Total final
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('TOTAL $:', margen, y);
    doc.text(`${(venta.total_final || 0).toFixed(2)}`, margen + anchoUtil - 5, y, { align: 'right' });
    y += 6;
    
    // Método de pago
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const metodoPagoNormalizado = this.normalizarMetodoPagoParaMostrar(venta.metodo_pago || '');
    
    // Dividir el método de pago en múltiples líneas si es muy largo
    const metodoPagoLineas = doc.splitTextToSize(`Forma de pago: ${metodoPagoNormalizado.toUpperCase()}`, anchoUtil);
    metodoPagoLineas.forEach((linea: string) => {
      doc.text(linea, margen, y);
      y += 4;
    });
    y += 4;
    
    // Línea divisoria doble
    doc.setLineWidth(0.3);
    doc.line(margen, y, margen + anchoUtil, y);
    y += 1;
    doc.line(margen, y, margen + anchoUtil, y);
    y += 6;
    
// ===== PIE DE PÁGINA =====
doc.setFontSize(9);
doc.setFont('helvetica', 'bold');
const mensajeGracias = this.configRecibo?.mensaje_agradecimiento || '¡Gracias por su compra!';
doc.text(mensajeGracias, 40, y, { align: 'center' });
y += 6;

// Desarrollado por (SIEMPRE FIJO)
doc.setFontSize(7);
doc.setFont('helvetica', 'normal');
const mensajePie = this.configRecibo?.mensaje_pie || 'DESARROLLADO POR PRISYS SOLUTIONS';
doc.text(mensajePie, 40, y, { align: 'center' });
y += 3.5;
const emailDev = this.configRecibo?.email_desarrollador || 'prisys.solutions@gmail.com';
doc.text(emailDev, 40, y, { align: 'center' });
y += 5;
    
    // Generar blob y abrir en nueva ventana
    const pdfBlob = doc.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);
    window.open(pdfUrl, '_blank');
    
    this.mostrarToast('✅ Recibo abierto en nueva pestaña', 'bg-green-600');
    this.cerrarModalRecibo();
    
  } catch (error) {
    console.error('Error al visualizar recibo:', error);
    this.mostrarToast('❌ Error al visualizar el recibo', 'bg-red-600');
  } finally {
    this.generandoRecibo = false;
  }
}

async cargarConfigRecibo(): Promise<void> {
  try {
    const { data, error } = await this.supabase.getClient()
      .from('configuracion_recibo')
      .select('*')
      .single();

    if (error) {
      console.error('Error al cargar config recibo:', error);
      
      // Si no existe ningún registro, usar configuración por defecto
      if (error.code === 'PGRST116') {
        this.configRecibo = {
          nombre_negocio: 'PRISYS SOLUTIONS',
          direccion: '9 DE JULIO 1718',
          ciudad: 'Corrientes - Capital (3400)',
          telefono1: '(3735) 475716',
          telefono2: '(3735) 410299',
          whatsapp1: '3735 475716',
          whatsapp2: '3735 410299',
          email_empresa: null,
          logo_url: null,
          mensaje_agradecimiento: '¡Gracias por su compra!',
          mensaje_pie: 'DESARROLLADO POR PRISYS SOLUTIONS',
          email_desarrollador: 'prisys.solutions@gmail.com'
        };
      }
      return;
    }

    if (data) {
      this.configRecibo = data;
    }
  } catch (error) {
    console.error('Error al cargar configuración del recibo:', error);
    // Configuración por defecto en caso de error
    this.configRecibo = {
      nombre_negocio: 'PRISYS SOLUTIONS',
      direccion: '9 DE JULIO 1718',
      ciudad: 'Corrientes - Capital (3400)',
      telefono1: '(3735) 475716',
      telefono2: '(3735) 410299',
      whatsapp1: '3735 475716',
      whatsapp2: '3735 410299',
      email_empresa: null,
      logo_url: null,
      mensaje_agradecimiento: '¡Gracias por su compra!',
      mensaje_pie: 'DESARROLLADO POR PRISYS SOLUTIONS',
      email_desarrollador: 'prisys.solutions@gmail.com'
    };
  }
}

// Método auxiliar para aplicar filtros a cualquier consulta
  private aplicarFiltrosBase(query: any) {
    // 1. Filtro de Fecha
    if (this.filtro === 'hoy') {
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      query = query.gte('fecha', hoy.toISOString());
    } else if (this.filtro === '7dias') {
      const hace7dias = new Date();
      hace7dias.setDate(hace7dias.getDate() - 7);
      query = query.gte('fecha', hace7dias.toISOString());
    } else if (this.filtro === '30dias') {
      const hace30dias = new Date();
      hace30dias.setDate(hace30dias.getDate() - 30);
      query = query.gte('fecha', hace30dias.toISOString());
    } else if (this.filtro === 'fechaEspecifica' && this.fechaEspecifica) {
      const desde = `${this.fechaEspecifica}T00:00:00`;
      const hasta = `${this.fechaEspecifica}T23:59:59`;
      query = query.gte('fecha', desde).lte('fecha', hasta);
    } 
    else if (this.filtro === 'rangoFechas' && this.fechaDesde && this.fechaHasta) {
      const desde = `${this.fechaDesde}T00:00:00`;
      const hasta = `${this.fechaHasta}T23:59:59`; // Include the entire end day
      query = query.gte('fecha', desde).lte('fecha', hasta);
    }

    // 2. Filtro de Tipo
    if (this.tipoFiltro !== 'todos') {
      let tipoDb = this.tipoFiltro === 'ventas' ? 'venta' :
                   this.tipoFiltro === 'ventasEliminadas' ? 'ventaEliminada' : 'recambio';
      query = query.eq('tipo', tipoDb);
    }

    // 3. Filtro de Método de Pago (CORREGIDO)
    if (this.metodoPagoFiltro !== 'todos') {
      if (this.metodoPagoFiltro === 'mercado_pago') {
        // Busca variantes: 'mercado_pago', 'Mercado Pago', 'modo'
        // Usamos un ilike más amplio para cubrir "Mercado Pago" y "mercado_pago"
        // Y un OR explícito para incluir "modo"
        query = query.or(`metodo_pago.ilike.%mercado%,metodo_pago.ilike.%modo%`);
      } else {
        query = query.ilike('metodo_pago', `%${this.metodoPagoFiltro}%`);
      }
    }

 // En aplicarFiltrosBase:
if (this.busquedaCliente.trim()) {
  const termino = this.busquedaCliente.trim();
  
  // Ahora usamos id_texto.ilike en lugar de id
  query = query.or(`cliente_nombre.ilike.%${termino}%,cliente_email.ilike.%${termino}%,nombre_usuario.ilike.%${termino}%,realizado_por.ilike.%${termino}%,id_texto.ilike.%${termino}%`);
}

    return query;
  }
}