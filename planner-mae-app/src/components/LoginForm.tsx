import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, Lock, UserPlus, LogIn } from 'lucide-react';

const logoSrc = `${import.meta.env.BASE_URL}logohorizontal.svg`;
import { useToast } from '@/hooks/use-toast';

const LoginForm: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const { login, register } = useAuth();
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim() || !password.trim()) {
      toast({
        title: "Campos obrigatórios",
        description: "Por favor, preencha e-mail e senha.",
        variant: "destructive"
      });
      return;
    }

    if (isRegister) {
      if (password !== confirmPassword) {
        toast({
          title: "Senhas não conferem",
          description: "A confirmação de senha deve ser igual à senha.",
          variant: "destructive"
        });
        return;
      }
      if (password.length < 6) {
        toast({
          title: "Senha muito curta",
          description: "A senha deve ter pelo menos 6 caracteres.",
          variant: "destructive"
        });
        return;
      }
      const success = register(email.trim(), password);
      if (success) {
        toast({ title: "Cadastro realizado!", description: "Bem-vinda ao Planner Mãe no Conta MãE." });
      } else {
        toast({ title: "E-mail já cadastrado", description: "Tente fazer login.", variant: "destructive" });
      }
    } else {
      const success = login(email.trim(), password);
      if (success) {
        toast({ title: "Bem-vinda de volta!", description: "Login realizado com sucesso." });
      } else {
        toast({ title: "Credenciais inválidas", description: "Verifique seu e-mail e senha.", variant: "destructive" });
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-creme to-sage-light flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-2xl border-0 bg-card/95 backdrop-blur-sm">
        <CardHeader className="text-center space-y-4 pb-2">
          <div className="mx-auto flex h-24 w-full max-w-[240px] items-center justify-center px-2">
            <img src={logoSrc} alt="CONTA MÃE" className="h-14 w-auto max-w-full object-contain" />
          </div>
          <CardTitle className="text-2xl font-bold text-foreground">Planner Mãe</CardTitle>
          <CardDescription className="text-muted-foreground">
            {isRegister
              ? "Crie uma conta local neste dispositivo para usar o planner."
              : "A sua sessão é apenas neste aparelho — integrado ao site Conta MãE."}
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground">E-mail</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="pl-10"
                  maxLength={255}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-10"
                  maxLength={100}
                />
              </div>
            </div>

            {isRegister && (
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-foreground">Confirmar Senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pl-10"
                    maxLength={100}
                  />
                </div>
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-sage to-sage-dark hover:opacity-90 text-primary-foreground py-3 rounded-xl text-base font-semibold gap-2 shadow-md"
            >
              {isRegister ? <UserPlus className="w-5 h-5" /> : <LogIn className="w-5 h-5" />}
              {isRegister ? "Criar Conta" : "Entrar"}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => { setIsRegister(!isRegister); setConfirmPassword(''); }}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
            >
              {isRegister ? "Já tem conta? Faça login" : "Não tem conta? Cadastre-se"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default LoginForm;
