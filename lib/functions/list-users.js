"use strict";
/**
 * @fileoverview Firebase Cloud Function to list all users for an admin panel.
 *
 * This file contains two Cloud Functions:
 * 1.  `listUsers`: A callable function that returns a list of all Firebase
 *     Authentication users, combined with their data from Firestore. It checks
 *     if the calling user has an 'admin' custom claim before executing.
 * 2.  `setUserStatus`: A callable function that allows an admin to disable or
 *     enable a user account in Firebase Authentication.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.setUserStatus = exports.listUsers = void 0;
const app_1 = require("firebase-admin/app");
const auth_1 = require("firebase-admin/auth");
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const logger = __importStar(require("firebase-functions/logger"));
// Initialize Firebase Admin SDK
// This will use the service account credentials available in the Cloud Functions environment.
if (!(0, app_1.getApps)().length) {
    (0, app_1.initializeApp)();
}
/**
 * A callable Cloud Function that lists all users.
 *
 * @remarks
 * This function can only be called by an authenticated user with the `admin` custom claim set to `true`.
 *
 * @throws `unauthenticated` - If the user is not authenticated.
 * @throws `permission-denied` - If the user is not an admin.
 * @throws `internal` - For any other server-side errors.
 *
 * @returns A promise that resolves with an array of user objects.
 */
exports.listUsers = (0, https_1.onCall)(async (request) => {
    var _a;
    logger.info("listUsers function called by:", (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid);
    // 1. Authentication and Authorization Check
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'A função deve ser chamada por um usuário autenticado.');
    }
    const isAdmin = request.auth.token.admin === true;
    if (!isAdmin) {
        throw new https_1.HttpsError('permission-denied', 'Permissão negada. Apenas administradores podem listar usuários.');
    }
    // 2. Fetch Data
    try {
        const authAdmin = (0, auth_1.getAuth)();
        const dbAdmin = (0, firestore_1.getFirestore)();
        const listUsersResult = await authAdmin.listUsers(1000);
        const authUsers = listUsersResult.users;
        const firestoreUsersSnap = await dbAdmin.collection('users').get();
        const firestoreUsersMap = new Map();
        firestoreUsersSnap.forEach(doc => {
            firestoreUsersMap.set(doc.id, doc.data());
        });
        const combinedUsers = authUsers.map(authUser => {
            const firestoreUser = firestoreUsersMap.get(authUser.uid);
            return {
                uid: authUser.uid,
                email: authUser.email,
                disabled: authUser.disabled,
                creationTime: authUser.metadata.creationTime,
                lastSignInTime: authUser.metadata.lastSignInTime,
                licenseType: (firestoreUser === null || firestoreUser === void 0 ? void 0 : firestoreUser.licenseType) || 'trial',
                trialEndsAt: firestoreUser === null || firestoreUser === void 0 ? void 0 : firestoreUser.trialEndsAt,
            };
        });
        combinedUsers.sort((a, b) => new Date(b.creationTime).getTime() - new Date(a.creationTime).getTime());
        logger.info(`Successfully fetched ${combinedUsers.length} users.`);
        return combinedUsers;
    }
    catch (error) {
        logger.error("Error listing users:", error);
        // Log a more detailed error to help diagnose permission issues.
        if (error instanceof Error) {
            throw new https_1.HttpsError('internal', `Erro interno ao processar a solicitação de usuários: ${error.message}`);
        }
        throw new https_1.HttpsError('internal', 'Ocorreu um erro desconhecido ao processar a solicitação de usuários.');
    }
});
/**
 * A callable Cloud Function to enable or disable a user account.
 *
 * @remarks
 * This function can only be called by an authenticated user with the `admin` custom claim set to `true`.
 * It expects `uid` (string) and `disabled` (boolean) in the data payload.
 *
 * @throws `unauthenticated` - If the user is not authenticated.
 * @throws `permission-denied` - If the user is not an admin.
 * @throws `invalid-argument` - If `uid` or `disabled` are missing or invalid.
 * @throws `internal` - For any other server-side errors.
 *
 * @returns A promise that resolves with a success message.
 */
exports.setUserStatus = (0, https_1.onCall)(async (request) => {
    var _a;
    logger.info("setUserStatus function called by:", (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid);
    logger.info("Payload:", request.data);
    // 1. Authentication and Authorization Check
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'A função deve ser chamada por um usuário autenticado.');
    }
    const isAdmin = request.auth.token.admin === true;
    if (!isAdmin) {
        throw new https_1.HttpsError('permission-denied', 'Permissão negada. Apenas administradores podem alterar o status de usuários.');
    }
    // 2. Validate Input
    const { uid, disabled } = request.data;
    if (typeof uid !== 'string' || uid.length === 0) {
        throw new https_1.HttpsError('invalid-argument', 'O UID do usuário é obrigatório e deve ser uma string.');
    }
    if (typeof disabled !== 'boolean') {
        throw new https_1.HttpsError('invalid-argument', 'O status "disabled" é obrigatório e deve ser um booleano.');
    }
    // 3. Perform Action
    try {
        const authAdmin = (0, auth_1.getAuth)();
        await authAdmin.updateUser(uid, { disabled });
        logger.info(`Successfully ${disabled ? 'disabled' : 'enabled'} user: ${uid}`);
        return { message: `Usuário ${disabled ? 'desativado' : 'ativado'} com sucesso.` };
    }
    catch (error) {
        logger.error("Error updating user status:", error);
        throw new https_1.HttpsError('internal', 'Erro ao atualizar o status do usuário.');
    }
});
//# sourceMappingURL=list-users.js.map