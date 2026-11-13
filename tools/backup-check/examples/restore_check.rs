fn main() {
    let source = std::env::args_os().nth(1).expect("backup path");
    let mut target = cpobras_storage::LocalStore::in_memory().unwrap();
    target
        .restore_from(source)
        .expect("restore candidate into temporary database");
    target.verify_integrity().unwrap();
    println!("Restore and integrity check succeeded; source unchanged");
}
