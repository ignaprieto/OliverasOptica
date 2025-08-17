import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from '../../services/supabase.service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html'
})
export class LoginComponent implements OnInit {
  email: string = '';
  password: string = '';
  error: string | null = null;
  isLoading: boolean = false;

  constructor(private supabase: SupabaseService, private router: Router) {}

  async ngOnInit() {
    // Verificar si ya está logueado al cargar el componente
    const { data } = await this.supabase.getClient().auth.getSession();
    if (data.session) {
      console.log('Usuario ya autenticado, redirigiendo...');
      this.router.navigate(['/dashboard']);
    }
    
    this.error = null;
  }

  async login() {
    this.error = null;
    this.isLoading = true;

    if (!this.email || !this.password) {
      this.error = 'Todos los campos son obligatorios';
      this.isLoading = false;
      return;
    }

    console.log('Intentando login con:', this.email);

    try {
      const { data: loginData, error } = await this.supabase.getClient().auth.signInWithPassword({
        email: this.email,
        password: this.password,
      });

      if (error) {
        console.error('Error de login:', error);
        this.error = 'Credenciales incorrectas';
        this.isLoading = false;
        return;
      }

      console.log('Login exitoso:', loginData);
      
      // Redirigir explícitamente después del login exitoso
      this.router.navigate(['/dashboard']);
      
    } catch (error) {
      console.error('Error inesperado en login:', error);
      this.error = 'Error inesperado. Inténtalo de nuevo.';
    } finally {
      this.isLoading = false;
    }
  }
}