import {filePathFromProtoWithoutExtension, filePathToPseudoNamespace, getPathToRoot} from "../util";
import {ExportMap} from "../ExportMap";
import {Printer} from "../Printer";
import {FileDescriptorProto} from "google-protobuf/google/protobuf/descriptor_pb";
import {WellKnownTypesMap} from "../WellKnown";
import {printMessage} from "./message";
import {printEnum} from "./enum";
import {printExtension} from "./extensions";
import * as ts from "typescript";

function importDeclaration(identifier: string, fromPackage: string): ts.ImportDeclaration {
    return ts.createImportDeclaration(
        /* decorators */ undefined,
        /* modifiers */ undefined,
        ts.createImportClause(ts.createIdentifier(identifier), undefined),
        ts.createLiteral(fromPackage)
    )
}

function printImports(fileDescriptor: FileDescriptorProto, rootPath: string, sourceFile: ts.SourceFile): string {
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

    return ts
        .createPrinter({newLine: ts.NewLineKind.LineFeed})
        .printList(ts.ListFormat.MultiLine, ts.createNodeArray(imports), sourceFile);
}

export function printFileDescriptorTSD(fileDescriptor: FileDescriptorProto, exportMap: ExportMap) {
    const fileName = fileDescriptor.getName();
    const packageName = fileDescriptor.getPackage();

    const upToRoot = getPathToRoot(fileName);
    const sourceFile = ts.createSourceFile(upToRoot, "", ts.ScriptTarget.Latest, undefined);


    const printer = new Printer(0);
    printer.printLn(`// package: ${packageName}`);
    printer.printLn(`// file: ${fileDescriptor.getName()}`);

    printer.printEmptyLn();
    printer.printLn(printImports(fileDescriptor, upToRoot, sourceFile));

    fileDescriptor.getMessageTypeList().forEach(enumType => {
        printer.print(printMessage(fileName, exportMap, enumType, 0, fileDescriptor, sourceFile));
    });

    fileDescriptor.getExtensionList().forEach(extension => {
        printer.print(printExtension(fileName, exportMap, extension, 0));
    });

    fileDescriptor.getEnumTypeList().forEach(enumType => {
        printer.print(printEnum(enumType, 0));
    });

    printer.printEmptyLn();

    return printer.getOutput();
}
