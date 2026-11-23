package com.lotocartons.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Toast;

/**
 * Ouvre la page Loto Cartons sur claude.ai dans un onglet intégré du navigateur.
 * La connexion claude.ai du navigateur est réutilisée : lecture des photos gratuite,
 * cartons et stats du compte.
 */
public class OuvrirActivity extends Activity {
    private static final String PAGE = "https://claude.ai/artifact/BNGvkSCaCFzrYDjVRPZtyc";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(PAGE));
        // Extras « Custom Tabs » (sans bibliothèque) : onglet intégré aux couleurs de l'appli.
        Bundle extras = new Bundle();
        extras.putBinder("android.support.customtabs.extra.SESSION", null);
        intent.putExtras(extras);
        intent.putExtra("android.support.customtabs.extra.TOOLBAR_COLOR", 0xFF16213A);
        try {
            startActivity(intent);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "Aucun navigateur pour ouvrir Loto Cartons", Toast.LENGTH_LONG).show();
        }
        finish();
    }
}
