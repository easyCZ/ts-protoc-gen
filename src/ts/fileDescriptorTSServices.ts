import {filePathFromProtoWithoutExtension, filePathToPseudoNamespace, getPathToRoot} from "../util";
import {ExportMap} from "../ExportMap";
import {Printer} from "../Printer";
import {
    FileDescriptorProto,
    MethodDescriptorProto,
    ServiceDescriptorProto
} from "google-protobuf/google/protobuf/descriptor_pb";
import {WellKnownTypesMap} from "../WellKnown";
import {getFieldType, MESSAGE_TYPE} from "./FieldTypes";
import * as ts from "typescript";

function importDeclaration(identifier: string, fromPackage: string): ts.ImportDeclaration {
    return ts.createImportDeclaration(
        /* decorators */ undefined,
        /* modifiers */ undefined,
        ts.createImportClause(ts.createIdentifier(identifier), undefined),
        ts.createLiteral(fromPackage)
    )
}

function printImports(fileDescriptor: FileDescriptorProto, rootPath: string, sourceFile: ts.SourceFile): ReadonlyArray<ts.Node> {
    const imports: ReadonlyArray<ts.Node> = [
        importDeclaration("* as jspb", "google-protobuf"),
        ...fileDescriptor.getDependencyList().map((dependency: string) => {
            const pseudoNamespace = filePathToPseudoNamespace(dependency);
            const fromPackage = dependency in WellKnownTypesMap
                ? `${WellKnownTypesMap[dependency]}`
                : `${rootPath}${filePathFromProtoWithoutExtension(dependency)}`;

            return importDeclaration(`* as ${pseudoNamespace}`, fromPackage);
        })
    ];

    return imports;
    // return ts
    //     .createPrinter({newLine: ts.NewLineKind.LineFeed})
    //     .printList(ts.ListFormat.MultiLine, ts.createNodeArray(imports), sourceFile);
}

// export class SimpleService {
//     static serviceName = "examplecom.SimpleService";
// }
export function buildServiceDeclaration(packageName: string, service: ServiceDescriptorProto): ts.ClassDeclaration {
    const members: ReadonlyArray<ts.ClassElement> = [
        ts.createProperty(
            undefined,
            [ts.createToken(ts.SyntaxKind.StaticKeyword)],
            "serviceName",
            undefined,
            undefined,
            ts.createLiteral(`${packageName ? packageName + "." : ""}${service.getName()}`)
        )
    ];

    return ts.createClassDeclaration(
        undefined,
        [ts.createToken(ts.SyntaxKind.ExportKeyword)],
        service.getName(),
        undefined,
        [],
        members,
    )
}

export function buildNamespaceDeclaration(namespace: string, statements: ReadonlyArray<ts.Statement>): ts.ModuleDeclaration {
    return ts.createModuleDeclaration(
        undefined,
        [ts.createToken(ts.SyntaxKind.ExportKeyword)],
        ts.createIdentifier(namespace),
        ts.createModuleBlock(statements),
    )
}

function staticReadonlyProperty(name: string, value: ts.Expression): ts.PropertyDeclaration {
    return ts.createProperty(
        undefined,
        [
            ts.createToken(ts.SyntaxKind.StaticKeyword),
            ts.createToken(ts.SyntaxKind.ReadonlyKeyword)
        ],
        name,
        undefined,
        undefined,
        value
    );
}

function buildStaticMethodDescriptor(service: ServiceDescriptorProto, method: MethodDescriptorProto, exportMap: ExportMap): ts.ClassDeclaration {
    const requestMessageTypeName = getFieldType(MESSAGE_TYPE, method.getInputType().slice(1), "", exportMap);
    const responseMessageTypeName = getFieldType(MESSAGE_TYPE, method.getOutputType().slice(1), "", exportMap);

    return ts.createClassDeclaration(
        undefined,
        [ts.createToken(ts.SyntaxKind.ExportKeyword)],
        method.getName(),
        undefined,
        [],
        [
            staticReadonlyProperty("methodName", ts.createLiteral(method.getName())),
            staticReadonlyProperty("service", ts.createLiteral(service.getName())),
            staticReadonlyProperty("requestStream", ts.createLiteral(method.getClientStreaming())),
            staticReadonlyProperty("responseStream", ts.createLiteral(method.getServerStreaming())),
            staticReadonlyProperty("requestType", ts.createLiteral(method.getServerStreaming())),
            staticReadonlyProperty("requestType", ts.createLiteral(requestMessageTypeName)),
            staticReadonlyProperty("responseType", ts.createLiteral(responseMessageTypeName)),
        ],
    )
}

export function printFileDescriptorTSServices(fileDescriptor: FileDescriptorProto, exportMap: ExportMap) {
    if (fileDescriptor.getServiceList().length === 0) {
        return "";
    }

    const fileName = fileDescriptor.getName();
    const packageName = fileDescriptor.getPackage();
    const upToRoot = getPathToRoot(fileName);
    const printer = new Printer(0);

    const sourceFile = ts.createSourceFile(upToRoot, "", ts.ScriptTarget.Latest, undefined);

    const statements: ts.NodeArray<ts.Statement> = ts.createNodeArray([
        importDeclaration("* as jspb", "google-protobuf"),
    ])
    sourceFile.statements = statements;
    const tsPrinter = ts.createPrinter({newLine: ts.NewLineKind.LineFeed});
    printer.printLn("// LOOL")
    printer.printLn(tsPrinter.printFile(sourceFile))


    printer.printLn(`// package: ${packageName}`);
    printer.printLn(`// file: ${fileDescriptor.getName()}`);
    printer.printEmptyLn();

    // Need to import the non-service file that was generated for this .proto file
    const asPseudoNamespace = filePathToPseudoNamespace(fileName);
    printer.printLn(`import * as ${asPseudoNamespace} from "${upToRoot}${filePathFromProtoWithoutExtension(fileName)}";`);

    fileDescriptor.getDependencyList().forEach((dependency: string) => {
        const pseudoNamespace = filePathToPseudoNamespace(dependency);
        if (dependency in WellKnownTypesMap) {
            printer.printLn(`import * as ${pseudoNamespace} from "${WellKnownTypesMap[dependency]}";`);
        } else {
            const filePath = filePathFromProtoWithoutExtension(dependency);
            printer.printLn(`import * as ${pseudoNamespace} from "${upToRoot + filePath}";`);
        }
    });

    // buildNamespaceDeclaration

    fileDescriptor.getServiceList().forEach(service => {
        printer.printLn(`export class ${service.getName()} {`);
        printer.printIndentedLn(`static serviceName = "${packageName ? packageName + "." : ""}${service.getName()}";`);
        printer.printLn(`}`);

        printer.printLn(`export namespace ${service.getName()} {`);
        const methodPrinter = new Printer(1);
        service.getMethodList().forEach(method => {
            const requestMessageTypeName = getFieldType(MESSAGE_TYPE, method.getInputType().slice(1), "", exportMap);
            const responseMessageTypeName = getFieldType(MESSAGE_TYPE, method.getOutputType().slice(1), "", exportMap);
            methodPrinter.printLn(`export class ${method.getName()} {`);
            methodPrinter.printIndentedLn(`static readonly methodName = "${method.getName()}";`);
            methodPrinter.printIndentedLn(`static readonly service = ${service.getName()};`);
            methodPrinter.printIndentedLn(`static readonly requestStream = ${method.getClientStreaming()};`);
            methodPrinter.printIndentedLn(`static readonly responseStream = ${method.getServerStreaming()};`);
            methodPrinter.printIndentedLn(`static readonly requestType = ${requestMessageTypeName};`);
            methodPrinter.printIndentedLn(`static readonly responseType = ${responseMessageTypeName};`);
            methodPrinter.printLn(`}`);
        });
        printer.print(methodPrinter.output);
        printer.printLn(`}`);
    });

    // printer.printLn("// TEST");
    //
    // // ts.createSourceFile("test.ts", "",)
    // // sourceFile.statements
    // fileDescriptor.getServiceList().forEach(service => {
    //     printer.printLn(tsPrinter.printNode(ts.EmitHint.Unspecified, buildServiceDeclaration(packageName, service), sourceFile));
    //
    //     const statements = service.getMethodList().map(method => {
    //         return buildStaticMethodDescriptor(service, method, exportMap);
    //     });
    //
    //     const module = buildNamespaceDeclaration(service.getName(), statements)
    //     printer.printLn(tsPrinter.printNode(ts.EmitHint.Unspecified, module, sourceFile));
    // });
    // printer.printLn("// end TEST");

    return printer.getOutput();
}
