import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Producto } from '../../models/producto.model';
import { SupabaseService } from '../../services/supabase.service';
import { RouterModule } from '@angular/router';
import { MonedaArsPipe } from '../../pipes/moneda-ars.pipe';

@Component({
  selector: 'app-productos',
  imports: [CommonModule, FormsModule, RouterModule,MonedaArsPipe],
  templateUrl: './productos.component.html',
  styleUrl: './productos.component.css'
})
export class ProductosComponent implements OnInit {
productos: Producto[] = [];
  filtro: string = '';

  constructor(private supabase: SupabaseService) {}

  async ngOnInit() {
    const { data, error } = await this.supabase.getClient().from('productos').select('*');
    if (!error && data) this.productos = data;
  }

 productosFiltrados(): Producto[] {
  const termino = this.filtro.toLowerCase();
  return this.productos.filter(p =>
    p.codigo.toLowerCase().includes(termino) ||
    p.nombre.toLowerCase().includes(termino) ||
    p.marca.toLowerCase().includes(termino) ||
    p.categoria.toLowerCase().includes(termino)
  );
  }
}
