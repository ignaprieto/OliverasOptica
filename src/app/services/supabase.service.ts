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

  // Métodos de autenticación
  async getCurrentUser() {
    const { data } = await this.supabase.auth.getSession();
    return data.session?.user || null;
  }

  async getCurrentUserRole(): Promise<string> {
    try {
      // 1. Primero revisar si hay sesión de Supabase (admin)
      const user = await this.getCurrentUser();
      if (user?.user_metadata?.['rol']) {
        return user.user_metadata['rol'];
      }

      // 2. Si no, revisar si hay vendedor en localStorage
      const vendedorStr = localStorage.getItem('user');
      if (vendedorStr) {
        const vendedor = JSON.parse(vendedorStr);
        return vendedor.rol || 'vendedor';
      }

      // 3. Si no hay nada, retornar 'guest' o null
      return 'guest';
    } catch (error) {
      console.error('Error obteniendo rol del usuario:', error);
      return 'guest';
    }
  }

  async getCurrentUserName(): Promise<string> {
    try {
      // 1. Revisar usuario de Supabase
      const user = await this.getCurrentUser();
      if (user) {
        return user.user_metadata?.['nombre'] || user.email || 'Usuario';
      }

      // 2. Revisar vendedor en localStorage
      const vendedorStr = localStorage.getItem('user');
      if (vendedorStr) {
        const vendedor = JSON.parse(vendedorStr);
        return vendedor.nombre || 'Vendedor';
      }

      return 'Usuario';
    } catch (error) {
      console.error('Error obteniendo nombre del usuario:', error);
      return 'Usuario';
    }
  }

  async isUserVendedor(): Promise<boolean> {
    const role = await this.getCurrentUserRole();
    return role === 'vendedor';
  }

  async isUserAdmin(): Promise<boolean> {
    const role = await this.getCurrentUserRole();
    return role === 'admin';
  }

  async signOut() {
    // Limpiar tanto sesión de Supabase como localStorage
    localStorage.removeItem('user');
    this.vendedorTemp = null;
    
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

  // Métodos de productos
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

  async getCurrentAppUser(): Promise<{ id: string; nombre: string; rol: string } | null> {
    // 1. Revisar si hay sesión real de Supabase (admin)
    const { data } = await this.supabase.auth.getUser();
    if (data?.user) {
      const user = data.user;
      return {
        id: user.id,
        nombre: user.user_metadata?.['nombre'] || user.email || 'Admin',
        rol: user.user_metadata?.['rol'] || 'admin'
      };
    }

    // 2. Revisar si hay sesión de vendedor en localStorage
    const vendedorStr = localStorage.getItem('user');
    if (vendedorStr) {
      const vendedor = JSON.parse(vendedorStr);
      return {
        id: vendedor.id,
        nombre: vendedor.nombre,
        rol: 'vendedor'
      };
    }

    // 3. No hay usuario logueado
    return null;
  }

  private vendedorTemp: any = null;

  setVendedorTemp(user: any) {
    this.vendedorTemp = user;
  }

  getVendedorTemp() {
    return this.vendedorTemp;
  }
}