// src/app/services/facturacion.service.ts
import { Injectable, inject,signal } from '@angular/core';
import { SupabaseService } from './supabase.service';

@Injectable({
  providedIn: 'root'
})
export class FacturacionService {
facturacionHabilitada = signal<boolean>(false);
  
  //SIGNAL PARA REGLAS
  reglasFacturacion = signal<{[key: string]: boolean}>({});

  private supabaseService = inject(SupabaseService);

async obtenerDatosFacturacionCompleta() {
    const { data, error } = await this.supabase
      .from('facturacion')
      .select('*')
      .single();
      
    if (data) {
      // Inicializamos los signals
      this.facturacionHabilitada.set(data.facturacion_habilitada);
      this.reglasFacturacion.set(data.reglas_facturacion || {});
    }
    return data;
  }

  // Aplica la regla según el método de pago seleccionado
  aplicarReglaPorMetodo(metodo: string) {
    const reglas = this.reglasFacturacion();
    
    // 1. Mapa de traducción (Ventas -> Configuración)
    const mapaNombres: { [key: string]: string } = {
      'debito': 'tarjeta_debito',
      'credito': 'tarjeta_credito',
      'efectivo': 'efectivo',
      'transferencia': 'transferencia',
      'mercado_pago': 'mercado_pago',
      'fiado': 'fiado'
    };

    const nombreNormalizado = mapaNombres[metodo] || metodo;
    
    // Lógica corregida: 
    // Verificamos si es estrictamente true. Cualquier otra cosa (false, undefined, null) cuenta como false.
    // Esto asegura que si pasas de Transferencia (Activado) a Efectivo (Sin regla), se desactive.
    const debeHabilitar = reglas[nombreNormalizado] === true;

    // Siempre actualizamos el estado, sea true o false
    this.actualizarEstadoGlobal(debeHabilitar);
  }

  // Actualiza el signal y la base de datos (lo usa el Navbar y las Reglas)
  async actualizarEstadoGlobal(habilitada: boolean) {
  this.facturacionHabilitada.set(habilitada); // Actualiza UI inmediatamente

  // Obtenemos el ID de configuración para actualizar la BD
  const { data } = await this.supabase.from('facturacion').select('id').single();

  if (data) {
    await this.supabase.from('facturacion')
      .update({ facturacion_habilitada: habilitada })
      .eq('id', data.id);
  }
}

  private get supabase() {
    return this.supabaseService.client; 
  }

  async obtenerConfiguracion() {
    const { data, error } = await this.supabase
      .from('configuracion_recibo')
      .select('*')
      .single();
    
    if (error) throw error;
    return data;
  }

  async actualizarConfiguracion(config: any) {
    const { error } = await this.supabase
      .from('configuracion_recibo')
      .update(config)
      .eq('id', config.id);

    if (error) throw error;
  }

  // Llama a la Edge Function para facturar en AFIP
  async facturarVenta(ventaId: string, tipoFactura: string, requiereLeyenda: boolean = false) {
  const { data, error } = await this.supabase.functions.invoke('arca-facturacion', {
    body: { 
      ventaId, 
      tipoFactura,
      requiereLeyenda 
    }
  });

  if (error) throw error;
  return data;
}

  async obtenerEstadoFacturacion() {
    const { data, error } = await this.supabase
      .from('facturacion')
      .select('id, facturacion_habilitada')
      .single(); // Puede devolver error si la tabla está vacía
      
    if (error && error.code !== 'PGRST116') {
        console.error('Error obteniendo estado facturación:', error);
        return null;
    }
    return data;
  }

async actualizarEstadoFacturacion(id: string, habilitada: boolean) {
    if (!id) throw new Error("No hay configuración de facturación creada.");
    
    const { error } = await this.supabase
      .from('facturacion')
      .update({ facturacion_habilitada: habilitada })
      .eq('id', id);

    if (error) throw error;
  }

  // Generación de PDF en el Cliente 
 async generarFacturaPDF(venta: any, config: any) {
    // 1. CARGA PEREZOSA (Lazy Loading) de librerías
    const [
      { default: jsPDF },
      { default: autoTable },
      QRCode
    ] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
      import('qrcode')
    ]);

    const doc = new jsPDF();
    const tipo = venta.factura_tipo || 'C';
    const esFacturaA = tipo === 'A';
    
    // --- LÓGICA DE DATOS ---
    // Código de tipo de comprobante según AFIP (1: A, 6: B, 11: C)
    const codTipoCmp = tipo === 'A' ? 1 : (tipo === 'B' ? 6 : 11);
    const codigoComprobanteStr = codTipoCmp.toString().padStart(3, '0');

    // --- ENCABEZADO ---
    // Cuadro Tipo Factura
    doc.setLineWidth(0.5);
    doc.rect(95, 10, 20, 15);
    doc.setFontSize(25);
    doc.setFont('helvetica', 'bold');
    doc.text(tipo, 105, 20, { align: 'center' });
    doc.setFontSize(8);
    doc.text(`COD. ${codigoComprobanteStr.slice(-2)}`, 105, 24, { align: 'center' });
    
    // Línea vertical divisoria
    doc.line(105, 25, 105, 50);

    // Datos Empresa (Izquierda)
    doc.setFontSize(16);
    doc.text(config.nombre_negocio || 'EMPRESA', 10, 15);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Razón Social:', 10, 22);
    doc.setFont('helvetica', 'normal');
    doc.text(config.nombre_negocio, 32, 22);
    
    doc.setFont('helvetica', 'bold');
    doc.text('Domicilio:', 10, 27);
    doc.setFont('helvetica', 'normal');
    doc.text(`${config.direccion} - ${config.ciudad}`, 32, 27);
    
    doc.setFont('helvetica', 'bold');
    doc.text('Cond. IVA:', 10, 32);
    doc.setFont('helvetica', 'normal');
    doc.text(config.condicion_iva, 32, 32);

    // Datos Factura (Derecha)
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('FACTURA', 130, 15);
    doc.setFontSize(10);
    
    doc.text('Punto de Venta:', 130, 22);
    doc.setFont('helvetica', 'normal');
    doc.text(config.punto_venta?.toString().padStart(4, '0') || '0001', 160, 22);
    
    doc.setFont('helvetica', 'bold');
    doc.text('Comp. Nro:', 170, 22);
    doc.setFont('helvetica', 'normal');
    doc.text(venta.factura_nro || '00000000', 190, 22);

    doc.setFont('helvetica', 'bold');
    doc.text('Fecha de Emisión:', 130, 27);
    doc.setFont('helvetica', 'normal');
    doc.text(new Date(venta.created_at || new Date()).toLocaleDateString('es-AR'), 165, 27);

    doc.setFont('helvetica', 'bold');
    doc.text('CUIT:', 130, 32);
    doc.setFont('helvetica', 'normal');
    doc.text(config.cuit, 160, 32);

    doc.setFont('helvetica', 'bold');
    doc.text('Ing. Brutos:', 130, 37);
    doc.setFont('helvetica', 'normal');
    doc.text(config.ingresos_brutos || '-', 160, 37);

    doc.setFont('helvetica', 'bold');
    doc.text('Inicio Act:', 130, 42);
    doc.setFont('helvetica', 'normal');
    doc.text(config.inicio_actividades || '-', 160, 42);

    doc.line(10, 52, 200, 52);

    // --- DATOS DEL CLIENTE ---
    doc.setFontSize(9);
    const clienteNombre = venta.cliente_nombre || venta.clientes?.nombre || 'Consumidor Final';
    const clienteCuit = venta.clientes?.cuit || venta.cliente_cuit || '00000000000';
    const clienteCondicion = venta.clientes?.condicion_iva || 'Consumidor Final';
    const clienteDireccion = venta.clientes?.direccion || '-';

    let yCli = 58;
    doc.setFont('helvetica', 'bold');
    doc.text('Cliente:', 10, yCli);
    doc.setFont('helvetica', 'normal');
    doc.text(clienteNombre, 25, yCli);

    doc.setFont('helvetica', 'bold');
    doc.text('CUIT:', 130, yCli);
    doc.setFont('helvetica', 'normal');
    doc.text(clienteCuit, 145, yCli);

    yCli += 5;
    doc.setFont('helvetica', 'bold');
    doc.text('Condición IVA:', 10, yCli);
    doc.setFont('helvetica', 'normal');
    doc.text(clienteCondicion, 35, yCli);

    doc.setFont('helvetica', 'bold');
    doc.text('Domicilio:', 130, yCli);
    doc.setFont('helvetica', 'normal');
    doc.text(clienteDireccion, 150, yCli);

    // --- TABLA DE PRODUCTOS ---
    const bodyData = venta.detalle_venta.map((item: any) => {
      // Cálculo: Si es A, mostramos Neto y el IVA se suma al final. Si es B/C, mostramos precio final.
      const precioUnitario = item.precio_unitario; 
      const subtotal = item.subtotal;
      
      return [
        item.productos?.codigo || '-',
        item.productos?.nombre || 'Producto',
        item.cantidad,
        `$${precioUnitario.toFixed(2)}`,
        `$${subtotal.toFixed(2)}`
      ];
    });

    autoTable(doc, {
      startY: 70,
      head: [['Código', 'Producto', 'Cant.', 'Precio Unit.', 'Subtotal']],
      body: bodyData,
      theme: 'grid',
      headStyles: { fillColor: [200, 200, 200], textColor: 0, fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 2 },
    });

    // --- TOTALES Y PIE DE PÁGINA ---
    // @ts-ignore
    let finalY = doc.lastAutoTable.finalY + 5;
    const total = parseFloat(venta.total_final);

    // Caja de totales
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    
    // Si es Factura A, discriminamos IVA
    if (esFacturaA) {
      const neto = total / 1.21;
      const iva = total - neto;
      
      doc.text('Subtotal Neto:', 140, finalY);
      doc.text(`$${neto.toFixed(2)}`, 190, finalY, { align: 'right' });
      finalY += 5;
      doc.text('IVA (21%):', 140, finalY);
      doc.text(`$${iva.toFixed(2)}`, 190, finalY, { align: 'right' });
      finalY += 5;
    }

    // Total Final
    doc.setFontSize(12);
    doc.setFillColor(230, 230, 230);
    doc.rect(135, finalY - 4, 65, 8, 'F');
    doc.text('TOTAL:', 140, finalY + 2);
    doc.text(`$${total.toFixed(2)}`, 190, finalY + 2, { align: 'right' });

    // --- GENERACIÓN DEL QR AFIP ---
    // Estructura oficial del JSON para QR de AFIP
    const fechaEmision = new Date(venta.fecha_venta || new Date());
    const fechaStr = fechaEmision.toISOString().split('T')[0]; // YYYY-MM-DD

    const datosQR = {
        ver: 1,
        fecha: fechaStr,
        cuit: parseInt(config.cuit.replace(/\D/g, '')),
        ptoVta: config.punto_venta,
        tipoCmp: codTipoCmp,
        nroCmp: parseInt(venta.factura_nro || 0),
        importe: total,
        moneda: "PES",
        ctz: 1, // Cotización pesos
        tipoDocRec: esFacturaA ? 80 : 99, // 80=CUIT, 99=Consumidor Final (ajustar si es DNI 96)
        nroDocRec: parseInt(clienteCuit.replace(/\D/g, '')) || 0,
        tipoCodAut: "E", // E para CAE
        codAut: parseInt(venta.cae || 0)
    };

    // Generar Base64 del JSON
    const jsonQR = JSON.stringify(datosQR);
    const base64QR = btoa(jsonQR);
    const urlQR = `https://www.afip.gob.ar/fe/qr/?p=${base64QR}`;

    // Generar imagen QR
    try {
        const qrDataUrl = await QRCode.toDataURL(urlQR, { errorCorrectionLevel: 'M' });
        
        // Posicionar QR y Logo en el pie
        const pieY = 250; 
        
        // QR a la izquierda
        doc.addImage(qrDataUrl, 'PNG', 10, pieY, 25, 25);
        
        // Logo AFIP (Texto o imagen si tienes el base64)
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text('Comprobante Autorizado', 40, pieY + 5);
        doc.setFont('helvetica', 'normal');
        doc.text('Esta Administración Federal no se responsabiliza', 40, pieY + 9);
        doc.text('por los datos ingresados en el detalle de la operación', 40, pieY + 13);

        // Datos CAE al lado del QR
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text(`CAE N°: ${venta.cae || '-'}`, 140, pieY + 10);
        
        const fechaVto = venta.cae_vto ? new Date(venta.cae_vto).toLocaleDateString('es-AR') : '-';
        doc.text(`Fecha Vto. CAE: ${fechaVto}`, 140, pieY + 15);

    } catch (e) {
        console.error('Error generando QR', e);
    }

    // Guardar PDF
    doc.save(`Factura-${venta.factura_tipo}-${venta.factura_nro}.pdf`);
  }
}