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

  constructor(private supabase: SupabaseService, private router: Router) {}

  ngOnInit() {
    this.supabase.getClient().auth.getSession().then(({ data }) => {
      if (data.session) {
        this.router.navigate(['/dashboard']);
      }
    });
  }

 async login() {
  this.error = null;

  if (!this.email || !this.password) {
    this.error = 'Todos los campos son obligatorios';
    return;
  }

  // Verificar si ya hay sesión activa
  const { data: sessionData } = await this.supabase.getClient().auth.getSession();
  if (sessionData.session) {
    this.router.navigate(['/dashboard']);
    return;
  }

  // Intentar loguear
  const { data: loginData, error } = await this.supabase.getClient().auth.signInWithPassword({
    email: this.email,
    password: this.password,
  });

  if (error) {
    this.error = 'Credenciales incorrectas';
    return;
  }

  if (loginData.session && loginData.session.user) {
    this.router.navigate(['/dashboard']);
  }
}

}
