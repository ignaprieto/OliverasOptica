import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { RouterModule } from '@angular/router';
import { MonedaArsPipe } from '../../pipes/moneda-ars.pipe';

interface ProductoOriginal {
  producto_id: string;
  nombre: string;
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
  tipo: 'venta' | 'recambio';
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
  items: ItemHistorial[] = [];
  itemsFiltrados: ItemHistorial[] = [];
  
  // Filtros
  filtro: 'hoy' | '7dias' | '30dias' | 'todos' | 'fechaEspecifica' = 'hoy';
  tipoFiltro: 'todos' | 'ventas' | 'recambios' = 'todos';
  fechaEspecifica: string = '';
  
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
  
  metodosPago = ['efectivo', 'transferencia', 'debito', 'credito', 'modo'];

  // PROPIEDADES NUEVAS PARA EL TOAST
  toastVisible = false;
  toastMensaje = '';
  toastColor = 'bg-green-600'; 

  constructor(private supabase: SupabaseService) {}

  async ngOnInit() {
    await this.obtenerUsuarioActual();
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

  async obtenerUsuarioActual() {
    const { data: sessionData, error } = await this.supabase.getClient().auth.getSession();
    if (sessionData.session?.user) {
      this.usuarioActual = sessionData.session.user;
    }
  }

  get itemsPaginados() {
    const inicio = (this.paginaActual - 1) * this.itemsPorPagina;
    return this.itemsFiltrados.slice(inicio, inicio + this.itemsPorPagina);
  }

  get totalPaginas(): number {
    return Math.ceil((this.itemsFiltrados?.length || 0) / this.itemsPorPagina);
  }

  cambiarPagina(pagina: number) {
    if (pagina >= 1 && pagina <= this.totalPaginas) {
      this.paginaActual = pagina;
    }
  }

  async filtrar(f: 'hoy' | '7dias' | '30dias' | 'todos' | 'fechaEspecifica') {
    this.paginaActual = 1;
    this.filtro = f;
    await this.cargarDatos();
  }

  async filtrarTipo(tipo: 'todos' | 'ventas' | 'recambios') {
    this.paginaActual = 1;
    this.tipoFiltro = tipo;
    this.aplicarFiltros();
    this.calcularTotales();
  }

  trackByFn(index: number, item: ItemHistorial): string {
    return item.id;
  }

  async cargarDatos() {
    await Promise.all([
      this.cargarVentas(),
      this.cargarRecambios()
    ]);
    this.combinarYOrdenarItems();
    this.aplicarFiltros();
    this.calcularTotales();
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

  combinarYOrdenarItems() {
    // Ordenar por fecha descendente
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
      case 'todos':
      default:
        break;
    }

    this.itemsFiltrados = itemsFiltrados;
  }

  calcularTotales() {
    this.totalVentas = this.itemsFiltrados
      .filter(item => item.tipo === 'venta')
      .reduce((acc, item) => acc + (item.total_final || 0), 0);

    this.totalRecambios = this.itemsFiltrados
      .filter(item => item.tipo === 'recambio')
      .reduce((acc, item) => acc + ((item.total_recambio || 0) - (item.total_devuelto || 0)), 0);
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
    
    // Calcular precios con descuento aplicado de la venta original
    this.productosOriginales = venta.productos.map((p: any) => {
      const precioConDescuento = venta.descuento_aplicado > 0 
        ? p.precio_unitario * (1 - venta.descuento_aplicado / 100)
        : p.precio_unitario;
      
      return {
        ...p,
        precio_unitario: precioConDescuento, // Precio ya con descuento aplicado
        subtotal: precioConDescuento * p.cantidad,
        seleccionado: false,
        cantidadDevolver: 1
      };
    });
    
    this.productosRecambio = [];
    this.motivoRecambio = '';
    this.observacionesRecambio = '';
    this.metodoPagoSeleccionado = '';
    this.busquedaProducto = '';
    
    // Reset descuento
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

  // Métodos para descuento en recambio
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
    // Calcular total de productos devueltos (ya con descuento de venta original aplicado)
    this.totalDevuelto = this.productosOriginales
      .filter(p => p.seleccionado)
      .reduce((total, p) => total + (p.precio_unitario * p.cantidadDevolver), 0);
    
    // Calcular total de productos de recambio sin descuento
    this.totalRecambioSinDescuento = this.productosRecambio
      .reduce((total, item) => total + (item.producto.precio * item.cantidad), 0);
    
    // Aplicar descuento al recambio
    this.montoDescuentoRecambio = this.totalRecambioSinDescuento * (this.descuentoRecambioAplicado / 100);
    this.totalRecambio = this.totalRecambioSinDescuento - this.montoDescuentoRecambio;
    
    // Calcular diferencia
    this.diferencia = this.totalRecambio - this.totalDevuelto;
  }

  puedeConfirmarRecambio(): boolean {
    const tieneProductosDevueltos = this.productosOriginales.some(p => p.seleccionado);
    const tieneProductosRecambio = this.productosRecambio.length > 0;
    const tieneMotivo = this.motivoRecambio.trim().length > 0;
    const tienePagoSiEsNecesario = this.diferencia <= 0 || this.metodoPagoSeleccionado.length > 0;
    
    return tieneProductosDevueltos && tieneProductosRecambio && tieneMotivo && tienePagoSiEsNecesario && !this.procesandoRecambio;
  }

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
    
    // Lógica de negocio: El cliente no puede recibir dinero.
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
      
      // 1. Actualizar stock de productos devueltos (aumentar)
      for (const producto of this.productosOriginales.filter(p => p.seleccionado)) {
        const { error: errorStock } = await client.rpc('actualizar_stock', {
          producto_id: producto.producto_id,
          cantidad_cambio: producto.cantidadDevolver
        });
        
        if (errorStock) {
          throw new Error(`Error al actualizar stock de producto devuelto: ${errorStock.message}`);
        }
      }
      
      // 2. Actualizar stock de productos de recambio (disminuir)
      for (const item of this.productosRecambio) {
        const { error: errorStock } = await client.rpc('actualizar_stock', {
          producto_id: item.producto.id,
          cantidad_cambio: -item.cantidad
        });
        
        if (errorStock) {
          throw new Error(`Error al actualizar stock de producto de recambio: ${errorStock.message}`);
        }
      }
      
      // 3. Crear registro en tabla recambios con usuario actual
      const productosDevueltosJson = this.productosOriginales
        .filter(p => p.seleccionado)
        .map(p => ({
          producto_id: p.producto_id,
          nombre: p.nombre,
          cantidad: p.cantidadDevolver,
          precio_unitario: p.precio_unitario,
          subtotal: p.precio_unitario * p.cantidadDevolver,
          talle: p.talle
        }));
      
      const productosRecambioJson = this.productosRecambio.map(item => ({
        producto_id: item.producto.id,
        nombre: item.producto.nombre,
        cantidad: item.cantidad,
        precio_unitario: item.producto.precio,
        subtotal: item.producto.precio * item.cantidad,
        talle: item.producto.talle
      }));
      
      const usuarioNombre = this.usuarioActual?.user_metadata?.['nombre'] || 'Usuario desconocido';
      
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
          realizado_por: usuarioNombre, // Usuario actual
          descuento_recambio: this.descuentoRecambioAplicado,
          monto_descuento_recambio: this.montoDescuentoRecambio
        })
        .select()
        .single();
      
      if (errorRecambio) {
        throw new Error(`Error al crear recambio: ${errorRecambio.message}`);
      }
      
      // 4. Crear registros en detalle_recambio
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
      
      // 5. Marcar la venta como recambio realizado
      const { error: errorVenta } = await client
        .from('ventas')
        .update({ recambio_realizado: true })
        .eq('id', this.ventaSeleccionada.id);
      
      if (errorVenta) {
        throw new Error(`Error al marcar venta como recambiada: ${errorVenta.message}`);
      }
      
      // 6. Actualizar la lista de datos
      await this.cargarDatos();
      
      // 7. Cerrar modal y mostrar éxito
      this.cerrarModalRecambio();
      this.mostrarToast('¡Recambio procesado exitosamente!', 'bg-green-600');
      
    } catch (error: any) {
      console.error('Error al procesar recambio:', error);
      this.mostrarToast(`Error al procesar el recambio: ${error.message}`, 'bg-red-600');
    } finally {
      this.procesandoRecambio = false;
    }
  }
}