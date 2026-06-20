
const SUPABASE_URL =
    "https://ipmidfvqftdahvdhasoy.supabase.co";

const SUPABASE_KEY =
    "sb_publishable_SEQtc6ZDgpDcDTUqqq_Ltw_Yo6_L8cD";

const PORTAL_URL =
    "https://lifeos-portal.netlify.app/portal.html";

const { createClient } = supabase;

const supabaseClient = createClient(
    SUPABASE_URL,
    SUPABASE_KEY,
    {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
        }
    }
);

function ensureSupabaseClient() {
    window.supabaseClient = supabaseClient;
    window.getSupabaseClient = function () {
        return supabaseClient;
    };
    window.PORTAL_URL = PORTAL_URL;
    return supabaseClient;
}

async function ensureProtectedSession() {
    const appShell = document.getElementById("app-layout");

    if (!appShell) {
        return true;
    }

    const {
        data: { session }
    } = await supabaseClient.auth.getSession();

    if (!session) {
        window.location.href = PORTAL_URL;
        return false;
    }

    return true;
}

ensureSupabaseClient();

if (document.getElementById("app-layout")) {
    ensureProtectedSession().catch((error) => {
        console.error("Failed to verify Supabase session:", error);
        window.location.href = PORTAL_URL;
    });
}

const registerBtn =
document.getElementById(
    "registerBtn"
);

if (
    registerBtn &&
    !document.getElementById(
        "registerForm"
    )
) {

    registerBtn.addEventListener(

        "click",

        () => {

            window.location.href =
            "register.html";

        }

    );

}

const registerForm =
document.getElementById("registerForm");

if (registerForm) {

    registerForm.addEventListener(

        "submit",

        async (e) => {

            e.preventDefault();

            const fullName =
            document.getElementById(
                "fullName"
            ).value.trim();

            const email =
            document.getElementById(
                "email"
            ).value.trim();

            const password =
            document.getElementById(
                "password"
            ).value;

            const confirmPassword =
            document.getElementById(
                "confirmPassword"
            ).value;

            if (
                !fullName ||
                !email ||
                !password ||
                !confirmPassword
            ) {

                alert(
                    "Please fill all fields"
                );

                return;

            }

            if (
                password !==
                confirmPassword
            ) {

                alert(
                    "Passwords do not match"
                );

                return;

            }

            if (
                password.length < 8
            ) {

                alert(
                    "Password must be at least 8 characters"
                );

                return;

            }

            const {
                error
            } = await supabaseClient.auth.signUp({

                email,

                password,

                options: {

                    data: {

                        full_name:
                        fullName

                    }

                }

            });

            if (error) {

                alert(
                    error.message
                );

                return;

            }

            alert(
                "Account created successfully. Check your email."
            );

            window.location.href =
            "index.html";

        }

    );

}

const backToLoginBtn =
document.getElementById(
    "backToLoginBtn"
);

if (backToLoginBtn) {

    backToLoginBtn.addEventListener(

        "click",

        () => {

            window.location.href =
            "index.html";

        }

    );

}

const loginForm =
document.getElementById("loginForm");

if (loginForm) {

    loginForm.addEventListener(
        "submit",
        async (e) => {

            e.preventDefault();

            const email =
            document.getElementById("email").value;

            const password =
            document.getElementById("password").value;

            const { data, error } =
            await supabaseClient.auth.signInWithPassword({
                email,
                password
            });

            if (error) {
                alert(error.message);
                console.log(error);
                return;
            }

            console.log(data);

            alert("Login Successful");

            window.location.href =
            "portal.html";

        }
    );

}

const forgotBtn =
document.getElementById("forgotBtn");

if(forgotBtn){

    forgotBtn.addEventListener(
        "click",
        async () => {

            const email =
            document.getElementById(
                "email"
            ).value;

            if(!email){
                alert(
                    "Email kiriting"
                );
                return;
            }

            const { error } =
            await supabaseClient.auth.resetPasswordForEmail(
                email,
                {
                    redirectTo:
                    "https://lifeos-portal.netlify.app/reset-password.html"
                }
            );

            if(error){
                alert(error.message);
                return;
            }

            alert(
                "Password reset email yuborildi"
            );

        }
    );

}

const passwordInput =
document.getElementById("password");

const togglePassword =
document.getElementById("togglePassword");

if(togglePassword){

    togglePassword.addEventListener(
        "click",
        () => {

            if(passwordInput.type === "password"){

                passwordInput.type = "text";
                togglePassword.textContent =
                "Hide Password";

            }else{

                passwordInput.type = "password";
                togglePassword.textContent =
                "Show Password";

            }

        }
    );

}

window.addEventListener(
    "load",
    () => {

        const email =
        document.getElementById("email");

        const password =
        document.getElementById("password");

        if(email){
            email.value = "";
        }

        if(password){
            password.value = "";
        }

    }
);

