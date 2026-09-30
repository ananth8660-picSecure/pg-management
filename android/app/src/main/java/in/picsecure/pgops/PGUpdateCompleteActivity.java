package in.picsecure.pgops;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public class PGUpdateCompleteActivity extends Activity {
  private int dp(float value) { return Math.round(value * getResources().getDisplayMetrics().density); }

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    getWindow().setStatusBarColor(Color.rgb(12, 25, 54));
    getWindow().setNavigationBarColor(Color.rgb(247, 249, 253));

    LinearLayout root = new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setGravity(Gravity.CENTER);
    root.setPadding(dp(28), dp(36), dp(28), dp(36));
    root.setBackgroundColor(Color.rgb(247, 249, 253));

    TextView badge = new TextView(this);
    badge.setText("âœ“");
    badge.setTextSize(36);
    badge.setGravity(Gravity.CENTER);
    badge.setTextColor(Color.rgb(32, 173, 121));
    root.addView(badge, new LinearLayout.LayoutParams(dp(84), dp(84)));

    TextView title = new TextView(this);
    title.setText("Update installed");
    title.setTextSize(26);
    title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
    title.setTextColor(Color.rgb(20, 31, 52));
    title.setGravity(Gravity.CENTER);
    LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    tp.topMargin = dp(14); root.addView(title, tp);

    TextView body = new TextView(this);
    body.setText("PG Management was updated successfully. You can open the updated app now or close this screen.");
    body.setTextSize(16);
    body.setTextColor(Color.rgb(96, 109, 132));
    body.setGravity(Gravity.CENTER);
    body.setLineSpacing(0, 1.15f);
    LinearLayout.LayoutParams bp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    bp.topMargin = dp(12); bp.bottomMargin = dp(28); root.addView(body, bp);

    Button open = new Button(this);
    open.setText("Open PG Management");
    open.setTextSize(16);
    open.setAllCaps(false);
    open.setOnClickListener(v -> {
      Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
      if (launch != null) {
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        startActivity(launch);
      }
      finish();
    });
    root.addView(open, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(56)));

    Button close = new Button(this);
    close.setText("Close");
    close.setTextSize(16);
    close.setAllCaps(false);
    close.setOnClickListener(v -> finishAndRemoveTask());
    LinearLayout.LayoutParams cp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(54));
    cp.topMargin = dp(12); root.addView(close, cp);

    setContentView(root);
  }
}