import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Producto } from '../../models/producto.model';
import { SupabaseService } from '../../services/supabase.service';
import { RouterModule } from '@angular/router';
import { MonedaArsPipe } from '../../pipes/moneda-ars.pipe';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-productos',
  imports: [CommonModule, FormsModule, RouterModule, MonedaArsPipe],
  templateUrl: './productos.component.html',
  styleUrl: './productos.component.css'
})
export class ProductosComponent implements OnInit {
  productos: Producto[] = [];
  filtro: string = '';
  
  // Estados de ordenamiento
  ordenPrecio: 'asc' | 'desc' | 'none' = 'none';
  ordenStock: 'asc' | 'desc' | 'none' = 'none';

  constructor(private supabase: SupabaseService, public themeService: ThemeService) {}

  async ngOnInit() {
    const { data, error } = await this.supabase.getClient().from('productos').select('*');
    if (!error && data) this.productos = data;
  }

  productosFiltrados(): Producto[] {
    const termino = this.filtro.toLowerCase();
    let productos = this.productos.filter(p =>
      p.codigo.toLowerCase().includes(termino) ||
      p.nombre.toLowerCase().includes(termino) ||
      p.marca.toLowerCase().includes(termino) ||
      p.categoria.toLowerCase().includes(termino)
    );

    // Aplicar ordenamiento por precio
    if (this.ordenPrecio === 'asc') {
      productos = productos.sort((a, b) => a.precio - b.precio);
    } else if (this.ordenPrecio === 'desc') {
      productos = productos.sort((a, b) => b.precio - a.precio);
    }

    // Aplicar ordenamiento por stock
    if (this.ordenStock === 'asc') {
      productos = productos.sort((a, b) => a.cantidad_stock - b.cantidad_stock);
    } else if (this.ordenStock === 'desc') {
      productos = productos.sort((a, b) => b.cantidad_stock - a.cantidad_stock);
    }

    return productos;
  }

  // Alternar ordenamiento por precio: none -> desc -> asc -> none
  toggleOrdenPrecio() {
    // Resetear ordenamiento por stock cuando se active precio
    this.ordenStock = 'none';
    
    if (this.ordenPrecio === 'none') {
      this.ordenPrecio = 'desc'; // Primer click: mayor a menor
    } else if (this.ordenPrecio === 'desc') {
      this.ordenPrecio = 'asc';  // Segundo click: menor a mayor
    } else {
      this.ordenPrecio = 'none'; // Tercer click: sin ordenar
    }
  }

  // Alternar ordenamiento por stock: none -> desc -> asc -> none
  toggleOrdenStock() {
    // Resetear ordenamiento por precio cuando se active stock
    this.ordenPrecio = 'none';
    
    if (this.ordenStock === 'none') {
      this.ordenStock = 'desc'; // Primer click: mayor a menor
    } else if (this.ordenStock === 'desc') {
      this.ordenStock = 'asc';  // Segundo click: menor a mayor
    } else {
      this.ordenStock = 'none'; // Tercer click: sin ordenar
    }
  }

  // Limpiar todos los filtros de ordenamiento
  limpiarFiltros() {
    this.ordenPrecio = 'none';
    this.ordenStock = 'none';
  }
}