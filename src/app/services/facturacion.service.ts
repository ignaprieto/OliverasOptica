import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';

@Injectable({
  providedIn: 'root'
})
export class FacturacionService {
  facturacionHabilitada = signal<boolean>(false);
  reglasFacturacion = signal<{ [key: string]: boolean }>({});

  private supabaseService = inject(SupabaseService);

  private get supabase() {
    return this.supabaseService.client;
  }

  async obtenerDatosFacturacionCompleta() {
    const { data } = await this.supabase
      .from('facturacion')
      .select('*')
      .single();

    if (data) {
      this.facturacionHabilitada.set(data.facturacion_habilitada);
      this.reglasFacturacion.set(data.reglas_facturacion || {});
    }
    return data;
  }

  aplicarReglaPorMetodo(metodo: string) {
    const reglas = this.reglasFacturacion();
    const mapaNombres: { [key: string]: string } = {
      'debito': 'tarjeta_debito',
      'credito': 'tarjeta_credito',
      'efectivo': 'efectivo',
      'transferencia': 'transferencia',
      'mercado_pago': 'mercado_pago',
      'fiado': 'fiado'
    };
    const nombreNormalizado = mapaNombres[metodo] || metodo;
    const debeHabilitar = reglas[nombreNormalizado] === true;
    this.actualizarEstadoGlobal(debeHabilitar);
  }

  async actualizarEstadoGlobal(habilitada: boolean) {
    this.facturacionHabilitada.set(habilitada);
    const { data } = await this.supabase.from('facturacion').select('id').single();
    if (data) {
      await this.supabase.from('facturacion')
        .update({ facturacion_habilitada: habilitada })
        .eq('id', data.id);
    }
  }

async visualizarFactura(ventaId: string) {
  try {
    // 1. Obtenemos todos los datos necesarios
    const [
      { data: venta, error: vError },
      { data: configFiscal },
      { data: configComercial }
    ] = await Promise.all([
      this.supabase.from('ventas').select('*, detalle_venta(*, productos(*)), clientes(*)').eq('id', ventaId).single(),
      this.supabase.from('facturacion').select('*').single(),
      this.supabase.from('configuracion_recibo').select('*').single()
    ]);

    if (vError || !venta) throw new Error("No se pudo recuperar la información de la venta");

    const configCompleta = {
      ...configFiscal,
      nombre_comercial: configComercial?.nombre_negocio,
      direccion_comercial: configComercial?.direccion,
      ciudad_comercial: configComercial?.ciudad,
      email_comercial: configComercial?.email_empresa,
      logo_url: configComercial?.logo_url
    };

    // 3. Generamos el PDF (Obtenemos el Blob)
    const pdfBlob = await this.generarFacturaPDF(venta, configCompleta);

    if (pdfBlob) {
      const pdfUrl = URL.createObjectURL(pdfBlob);
      window.open(pdfUrl, '_blank');
      // Limpiamos la memoria después de un momento
      setTimeout(() => URL.revokeObjectURL(pdfUrl), 1000);
    }
    // ------------------------------

  } catch (err) {
    console.error("Error al visualizar factura:", err);
    throw err;
  }
}

 async facturarVenta(ventaId: string, tipoFactura: string, requiereLeyenda: boolean = false) {
  try {
    // 1. Llamada a la Edge Function
    const { data, error } = await this.supabase.functions.invoke('arca-facturacion', {
      body: { ventaId, tipoFactura, requiereLeyenda }
    });

    if (error) throw new Error(error.message || 'Error en la comunicación con la función');
    if (data?.error) throw new Error(data.error);

    // 2. Obtener datos para el PDF (Igual que antes)
    const [
      { data: ventaActualizada }, 
      { data: configFiscal }, 
      { data: configComercial }
    ] = await Promise.all([
      this.supabase.from('ventas').select('*, detalle_venta(*, productos(*)), clientes(*)').eq('id', ventaId).single(),
      this.supabase.from('facturacion').select('*').single(),
      this.supabase.from('configuracion_recibo').select('*').single()
    ]);

    const configCompleta = {
      ...configFiscal,
      nombre_comercial: configComercial?.nombre_negocio,
      direccion_comercial: configComercial?.direccion,
      ciudad_comercial: configComercial?.ciudad,
      email_comercial: configComercial?.email_empresa,
      logo_url: configComercial?.logo_url
    };

    // 3. Generar el PDF como BLOB
    const pdfBlob = await this.generarFacturaPDF(ventaActualizada, configCompleta);

    // 4. --- APERTURA COMO BLOB EN NUEVA PESTAÑA ---
    if (pdfBlob) {
      // Forzamos el tipo application/pdf para que el navegador lo visualice
      const viewBlob = new Blob([pdfBlob], { type: 'application/pdf' });
      const url = URL.createObjectURL(viewBlob);
      
      // Abrimos la ventana
      const win = window.open(url, '_blank');
      
      if (win) {
        win.focus();
        // Limpieza opcional después de un tiempo
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } else {
        // Fallback: Si el popup fue bloqueado, mostramos un mensaje o descargamos
        alert('Por favor, permite las ventanas emergentes para ver la factura.');
        const link = document.createElement('a');
        link.href = url;
        link.download = `Factura_${ventaActualizada.factura_nro || ventaId}.pdf`;
        link.click();
      }
    }

    return data;
  } catch (err: any) {
    console.error('Error en facturarVenta:', err);
    throw err;
  }
}

  async generarFacturaPDF(venta: any, config: any): Promise<Blob> {
    const [{ default: jsPDF }, { default: autoTable }, QRCode] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
      import('qrcode')
    ]);

    const doc = new jsPDF();
    const tipo = venta.factura_tipo || 'C';
    const esFacturaA = tipo === 'A';
    const codTipoCmp = tipo === 'A' ? 1 : (tipo === 'B' ? 6 : 11);
    const codigoComprobanteStr = codTipoCmp.toString().padStart(3, '0');

    // --- ENCABEZADO CENTRAL (LETRA) ---
    doc.setLineWidth(0.5);
    doc.rect(95, 10, 20, 15);
    doc.setFontSize(25);
    doc.setFont('helvetica', 'bold');
    doc.text(tipo, 105, 20, { align: 'center' });
    doc.setFontSize(8);
    doc.text(`COD. ${codigoComprobanteStr.slice(-2)}`, 105, 24, { align: 'center' });
    doc.line(105, 25, 105, 50);

    // --- EMISOR (IZQUIERDA) ---
    let startYText = 15;
    if (config.logo_url) {
      try {
        doc.addImage(config.logo_url, 'PNG', 10, 10, 30, 15);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(config.nombre_comercial || '', 45, 18);
        startYText = 25;
      } catch (e) {
        doc.setFont('helvetica', 'bold');
        doc.text(config.nombre_comercial || 'EMPRESA', 10, 15);
      }
    } else {
      doc.setFont('helvetica', 'bold');
      doc.text(config.nombre_comercial || 'EMPRESA', 10, 15);
    }

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Razón Social:', 10, startYText + 7);
    doc.setFont('helvetica', 'normal');
    doc.text(config.razon_social || '', 32, startYText + 7);

    doc.setFont('helvetica', 'bold');
    doc.text('Domicilio:', 10, startYText + 12);
    doc.setFont('helvetica', 'normal');
    doc.text(`${config.direccion_comercial || ''} - ${config.ciudad_comercial || ''}`, 32, startYText + 12);

    doc.setFont('helvetica', 'bold');
    doc.text('Email:', 10, startYText + 17);
    doc.setFont('helvetica', 'normal');
    doc.text(config.email_comercial || '-', 32, startYText + 17);

    doc.setFont('helvetica', 'bold');
    doc.text('Cond. IVA:', 10, startYText + 22);
    doc.setFont('helvetica', 'normal');
    doc.text(config.condicion_iva?.toUpperCase() || '', 32, startYText + 22);

    // --- COMPROBANTE (DERECHA) ---
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('FACTURA', 130, 15);
    doc.setFontSize(10);
    doc.text('Punto de Venta:', 130, 22);
    doc.setFont('helvetica', 'normal');
    doc.text(config.punto_venta?.toString().padStart(5, '0') || '00001', 160, 22);
    doc.setFont('helvetica', 'bold');
    doc.text('Comp. Nro:', 170, 22);
    doc.setFont('helvetica', 'normal');
    doc.text(venta.factura_nro || '00000000', 190, 22);
    doc.setFont('helvetica', 'bold');
    doc.text('Fecha Emisión:', 130, 27);
    doc.setFont('helvetica', 'normal');
    doc.text(new Date(venta.created_at || new Date()).toLocaleDateString('es-AR'), 165, 27);
    doc.setFont('helvetica', 'bold');
    doc.text('CUIT:', 130, 32);
    doc.setFont('helvetica', 'normal');
    doc.text(config.cuit || '', 160, 32);
    doc.setFont('helvetica', 'bold');
    doc.text('Ing. Brutos:', 130, 37);
    doc.setFont('helvetica', 'normal');
    doc.text(config.ingresos_brutos || '-', 160, 37);
    doc.setFont('helvetica', 'bold');
    doc.text('Inicio Act:', 130, 42);
    doc.setFont('helvetica', 'normal');
    doc.text(config.inicio_actividades || '-', 160, 42);

    doc.line(10, 52, 200, 52);

    // --- RECEPTOR ---
    const clienteCuit = venta.clientes?.cuit || '0';
    let yCli = 58;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Cliente:', 10, yCli);
    doc.setFont('helvetica', 'normal');
    doc.text((venta.clientes?.nombre || 'Consumidor Final').toUpperCase(), 25, yCli);

    doc.setFont('helvetica', 'bold');
    doc.text('CUIT:', 130, yCli);
    doc.setFont('helvetica', 'normal');
    doc.text(clienteCuit !== '0' ? clienteCuit : '-', 145, yCli);

    yCli += 5;
    doc.setFont('helvetica', 'bold');
    doc.text('Condición IVA:', 10, yCli);
    doc.setFont('helvetica', 'normal');
    doc.text(venta.clientes?.condicion_iva || 'Consumidor Final', 35, yCli);

    doc.setFont('helvetica', 'bold');
    doc.text('Domicilio:', 130, yCli);
    doc.setFont('helvetica', 'normal');
    doc.text(venta.clientes?.direccion || '-', 150, yCli);

    yCli += 5;
    doc.setFont('helvetica', 'bold');
    doc.text('Forma de Pago:', 10, yCli);
    doc.setFont('helvetica', 'normal');
    doc.text((venta.metodo_pago || 'Efectivo').toUpperCase(), 35, yCli);

    // --- TABLA PRODUCTOS ---
    const bodyData = venta.detalle_venta.map((item: any) => {
      const pUnitario = parseFloat(item.precio_unitario);
      const displayPUnit = esFacturaA ? (pUnitario / 1.21) : pUnitario;
      const displaySubtotal = esFacturaA ? (item.subtotal / 1.21) : item.subtotal;
      return [
        item.productos?.codigo || '-',
        item.productos?.nombre || 'Producto',
        item.cantidad,
        `$${displayPUnit.toFixed(2)}`,
        esFacturaA ? '21%' : 'IVA Inc.',
        `$${displaySubtotal.toFixed(2)}`
      ];
    });

    autoTable(doc, {
      startY: 75,
      head: [['Código', 'Producto', 'Cant.', 'Precio Unit.', 'Alíc. IVA', 'Subtotal']],
      body: bodyData,
      theme: 'grid',
      headStyles: { fillColor: [230, 230, 230], textColor: 0, fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 2 },
    });

    // --- TOTALES Y LEYENDAS ---
    // @ts-ignore
    let finalY = doc.lastAutoTable.finalY + 10;
    const total = parseFloat(venta.total_final);

    if (esFacturaA) {
      const neto = total / 1.21;
      const iva = total - neto;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('Importe Neto Gravado:', 140, finalY);
      doc.setFont('helvetica', 'normal');
      doc.text(`$${neto.toFixed(2)}`, 190, finalY, { align: 'right' });
      finalY += 5;
      doc.setFont('helvetica', 'bold');
      doc.text('IVA 21%:', 140, finalY);
      doc.setFont('helvetica', 'normal');
      doc.text(`$${iva.toFixed(2)}`, 190, finalY, { align: 'right' });
      finalY += 5;
    }

    doc.setFontSize(12);
    doc.setFillColor(245, 245, 245);
    doc.rect(135, finalY - 4, 65, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL:', 140, finalY + 2);
    doc.text(`$${total.toFixed(2)}`, 190, finalY + 2, { align: 'right' });

    finalY += 10;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.text('Este comprobante esta expresado en: PESOS ARGENTINOS', 10, finalY);

    if (tipo === 'C') {
      finalY += 5;
      doc.setFontSize(8);
      doc.text('Responsable Monotributo - IVA Incluido', 10, finalY);
    }

    // --- PIE DE PÁGINA (QR Y CAE) ---
    const pieY = 260;
    const fechaEmision = new Date(venta.fecha_venta || new Date());
    const datosQR = {
      ver: 1,
      fecha: fechaEmision.toISOString().split('T')[0],
      cuit: parseInt(config.cuit?.replace(/\D/g, '') || "0"),
      ptoVta: config.punto_venta,
      tipoCmp: codTipoCmp,
      nroCmp: parseInt(venta.factura_nro || 0),
      importe: total,
      moneda: "PES",
      ctz: 1,
      tipoDocRec: esFacturaA ? 80 : (clienteCuit.length > 10 ? 80 : 99),
      nroDocRec: parseInt(clienteCuit.replace(/\D/g, '')) || 0,
      tipoCodAut: "E",
      codAut: parseInt(venta.cae || 0)
    };

    const urlQR = `https://www.arca.gob.ar/fe/qr/?p=${btoa(JSON.stringify(datosQR))}`;

    try {
      const qrDataUrl = await QRCode.toDataURL(urlQR, { errorCorrectionLevel: 'M', margin: 1 });
      doc.addImage(qrDataUrl, 'PNG', 10, pieY - 5, 30, 30);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('ARCA', 45, pieY + 5);
      doc.setFontSize(8);
      doc.text('Comprobante Autorizado', 45, pieY + 10);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text('Esta Administración Federal no se responsabiliza por los datos ingresados', 45, pieY + 15);
      doc.text('en el detalle de la operación.', 45, pieY + 18);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(`CAE N°: ${venta.cae || '-'}`, 140, pieY + 10);
      const fechaVto = venta.cae_vto ? new Date(venta.cae_vto).toLocaleDateString('es-AR') : '-';
      doc.text(`Fecha Vto. CAE: ${fechaVto}`, 140, pieY + 15);
    } catch (e) {
      console.error('Error generando QR', e);
    }

 const blob = doc.output('blob');  
  return blob;
  }
}