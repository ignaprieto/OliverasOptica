import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { Producto } from '../models/producto.model';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey, {
      auth: {
        persistSession: true
      }
    });
  }

  getClient() {
    return this.supabase;
  }

  // Métodos de autenticación adicionales
  async getCurrentUser() {
    const { data } = await this.supabase.auth.getSession();
    return data.session?.user || null;
  }

  async getCurrentUserRole(): Promise<string> {
    try {
      const user = await this.getCurrentUser();
      return user?.user_metadata?.['rol'] || 'admin';
    } catch (error) {
      console.error('Error obteniendo rol del usuario:', error);
      return 'admin';
    }
  }

  async getCurrentUserName(): Promise<string> {
    try {
      const user = await this.getCurrentUser();
      return user?.user_metadata?.['nombre'] || 'Usuario';
    } catch (error) {
      console.error('Error obteniendo nombre del usuario:', error);
      return 'Usuario';
    }
  }

  async isUserVendedor(): Promise<boolean> {
    const role = await this.getCurrentUserRole();
    return role === 'vendedor';
  }

  async signOut() {
    const { error } = await this.supabase.auth.signOut();
    if (error) throw error;
  }

  async signInWithPassword(email: string, password: string) {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password
    });
    if (error) throw error;
    return data;
  }

  // Métodos de productos existentes
  async obtenerProductos(): Promise<Producto[]> {
    const { data, error } = await this.supabase.from('productos').select('*');
    if (error) throw error;
    return data;
  }

  async agregarProducto(producto: Producto) {
    const { data, error } = await this.supabase
      .from('productos')
      .insert([
        {
          codigo: producto.codigo,
          nombre: producto.nombre,
          marca: producto.marca,
          talle: producto.talle,
          categoria: producto.categoria,
          precio: producto.precio,
          cantidad_stock: producto.cantidad_stock
        }
      ]);

    if (error) throw error;
    return data;
  }

  async editarProducto(id: string, producto: Producto) {
    const { error } = await this.supabase.from('productos').update(producto).eq('id', id);
    if (error) throw error;
  }

  async eliminarProducto(id: string) {
    const { error } = await this.supabase.from('productos').delete().eq('id', id);
    if (error) throw error;
  }
}