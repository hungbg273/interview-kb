import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-google-oauth20';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID || 'missing-google-client-id',
      clientSecret:
        process.env.GOOGLE_CLIENT_SECRET || 'missing-google-client-secret',
      // In production set GOOGLE_CALLBACK_URL to the public HTTPS API URL, e.g.
      // https://api.example.com/auth/google/callback (also register it in Google Console).
      callbackURL:
        process.env.GOOGLE_CALLBACK_URL ||
        'http://localhost:4000/auth/google/callback',
      scope: ['email', 'profile'],
    });
  }

  validate(_accessToken: string, _refreshToken: string, profile: Profile) {
    const email = profile.emails?.[0]?.value;
    return { email, displayName: profile.displayName };
  }
}
