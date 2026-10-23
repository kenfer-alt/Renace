package com.renace.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RenacePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
