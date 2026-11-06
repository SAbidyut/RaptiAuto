package android.webkit;

/**
 * Compile-time stand-in for the API 26 class (the build uses the API 23 android.jar).
 * Only javac sees it; it is not packed into the APK, so phones use the real framework class.
 */
public abstract class RenderProcessGoneDetail {
    public abstract boolean didCrash();

    public abstract int rendererPriorityAtExit();
}
